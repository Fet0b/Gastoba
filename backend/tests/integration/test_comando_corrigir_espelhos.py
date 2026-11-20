"""Comando `corrigir-espelhos-da-conta-investimentos` sobre SQLite temporário (071, T018)."""

import io
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import text

from gastoba.administracao.comandos import principal
from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.ganho import Ganho, OrigemDoGanho
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.transacao_importada import (
    SentidoDaTransacao,
    TransacaoImportada,
)
from gastoba.domain.tratamento_de_aporte import AcaoDoTratamento, TratamentoDeAporte
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

DIA = date(2026, 10, 12)
APLICACAO = "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA"
RESGATE = "CONTA REMUNERADA - RESGATE APLICAÇÃO"


@pytest.fixture
def configuracoes(tmp_path):
    configuracoes = Configuracoes(url_banco=f"sqlite:///{tmp_path}/espelhos.db")
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    return configuracoes


@pytest.fixture
def uow(configuracoes):
    return UnidadeDeTrabalhoSqlAlchemy(
        criar_fabrica_de_sessoes(criar_engine(configuracoes.url_banco))
    )


def _semear(uow, email="ana@x.com"):
    """Os quatro grupos da E1: ganhos (4), aportes tratados (2), pendentes (2), ignoradas (2)."""
    usuario = Usuario("Ana", email=Email.de_texto(email))
    conta = Conta(
        usuario.id,
        f"Corretora {email}",
        Dinheiro(82388),
        origem=OrigemDaConta.OPEN_FINANCE,
        id_externo=f"c-{email}",
        tipo=TipoDaConta.REMUNERADA,
    )
    n = [0]

    def transacao(descricao, valor, sentido, aceita=False, ignorada=False):
        n[0] += 1
        t = TransacaoImportada(conta.id, f"t{n[0]}", DIA, descricao, Dinheiro(valor), sentido)
        if aceita:
            t.aceitar()
        if ignorada:
            t.ignorar()
        return t

    ganhos = [
        transacao(RESGATE, v, SentidoDaTransacao.ENTRADA, aceita=True)
        for v in (50000, 60000, 30000, 15841)
    ]
    aportes = [
        transacao(APLICACAO, v, SentidoDaTransacao.SAIDA, aceita=True) for v in (100000, 56413)
    ]
    pendentes = [transacao(APLICACAO, v, SentidoDaTransacao.SAIDA) for v in (100000, 71330)]
    ignoradas = [
        transacao(RESGATE, v, SentidoDaTransacao.ENTRADA, ignorada=True) for v in (7000, 3000)
    ]
    controle = transacao("EMISSAO - CDB BANCO FICTICIO", 7000, SentidoDaTransacao.SAIDA)
    with uow:
        uow.usuarios.salvar(usuario)
        uow.contas.adicionar(conta)
        for t in [*ganhos, *aportes, *pendentes, *ignoradas, controle]:
            uow.transacoes_importadas.adicionar_se_nova(t)
            uow.transacoes_importadas.atualizar_estado(t)
        for t in ganhos:
            uow.ganhos.adicionar(
                Ganho(
                    conta.id,
                    t.valor,
                    t.descricao,
                    DIA,
                    transacao_importada_id=t.id,
                    origem=OrigemDoGanho.OPEN_FINANCE,
                )
            )
        for t in aportes:
            movimento = MovimentoDeInvestimento(
                conta.id,
                TipoDeMovimento.APORTE,
                t.valor,
                t.descricao,
                DIA,
                transacao_importada_id=t.id,
            )
            uow.movimentos_de_investimento.adicionar(movimento)
            uow.tratamentos.adicionar(
                usuario.id,
                TratamentoDeAporte(
                    movimento.id,
                    AcaoDoTratamento.EXCLUIDO,
                    {"transacao_importada_id": str(t.id)},
                    datetime(2026, 11, 1, tzinfo=UTC),
                ),
            )
        uow.commit()
    return usuario, [*ganhos, *aportes, *pendentes, *ignoradas], controle


def _rodar(configuracoes, *argumentos, email="ana@x.com"):
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["corrigir-espelhos-da-conta-investimentos", "--email", email, *argumentos],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    return codigo, saida.getvalue(), erros.getvalue()


def _contagens(configuracoes):
    engine = criar_engine(configuracoes.url_banco)
    with engine.connect() as conexao:
        resultado = {
            "ganhos": conexao.execute(text("select count(*) from ganhos")).scalar(),
            "movimentos": conexao.execute(
                text("select count(*) from movimentos_de_investimento")
            ).scalar(),
            "reversoes": conexao.execute(
                text("select count(*) from reversoes_de_classificacao")
            ).scalar(),
            "saldo": conexao.execute(text("select sum(saldo_centavos) from contas")).scalar(),
            "estados": dict(
                conexao.execute(
                    text(
                        "select estado || ':' || coalesce(motivo_ignorada, '-'), count(*) "
                        "from transacoes_importadas group by 1"
                    )
                ).all()
            ),
        }
    engine.dispose()
    return resultado


def test_simulacao_imprime_so_contagens_e_somas_e_nao_grava(configuracoes, uow):
    _, transacoes, _ = _semear(uow)
    antes = _contagens(configuracoes)

    codigo, saida, erros = _rodar(configuracoes)

    assert codigo == 0 and erros == ""
    assert "SIMULAÇÃO" in saida
    assert "aceitos como ganho: 4 (R$ 1558.41)" in saida
    assert "aceitos como aporte ou resgate: 2 (R$ 1564.13)" in saida
    assert "pendentes na caixa: 2 (R$ 1713.30)" in saida
    assert "ignorados sem o motivo: 2 (R$ 100.00)" in saida
    assert _contagens(configuracoes) == antes
    # Nenhuma descrição nem id aparece na saída.
    assert "CONTA REMUNERADA" not in saida
    assert not any(str(t.id) in saida for t in transacoes)


def test_aplicar_corrige_tudo_confere_as_somas_e_a_segunda_execucao_da_zero(configuracoes, uow):
    _semear(uow)
    antes = _contagens(configuracoes)

    codigo, saida, _ = _rodar(configuracoes, "--aplicar")

    assert codigo == 0 and saida.startswith("APLICADO")
    depois = _contagens(configuracoes)
    assert depois["ganhos"] == 0  # os 4 ganhos saíram
    assert depois["movimentos"] == antes["movimentos"]  # o aporte tratado fica (FK)
    assert depois["reversoes"] == 4
    assert depois["saldo"] == antes["saldo"]  # saldo do banco intacto
    assert depois["estados"] == {
        "ignorada:movimento_interno_da_conta": 10,
        "pendente:-": 1,  # o controle (emissão de CDB)
    }

    codigo, saida, _ = _rodar(configuracoes, "--aplicar")

    assert codigo == 0 and "Nada a fazer." in saida
    assert _contagens(configuracoes) == depois


def test_so_a_pessoa_do_email_e_tocada(configuracoes, uow):
    _semear(uow, "ana@x.com")
    _semear(uow, "bia@x.com")

    _rodar(configuracoes, "--aplicar", email="ana@x.com")

    engine = criar_engine(configuracoes.url_banco)
    with engine.connect() as conexao:
        ganhos_da_bia = conexao.execute(
            text(
                "select count(*) from ganhos g join contas c on c.id = g.conta_id "
                "join usuarios u on u.id = c.usuario_id where u.email = 'bia@x.com'"
            )
        ).scalar()
    engine.dispose()
    assert ganhos_da_bia == 4


def test_usuario_inexistente_da_erro(configuracoes):
    codigo, _, erros = _rodar(configuracoes, email="ninguem@x.com")
    assert codigo == 1 and "usuário não encontrado" in erros
