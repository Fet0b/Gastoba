import io
from datetime import date

import pytest

from gastoba.administracao.comandos import principal
from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.destinacao import ParteDeDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

DIA = date(2026, 10, 12)


@pytest.fixture
def configuracoes(tmp_path):
    configuracoes = Configuracoes(url_banco=f"sqlite:///{tmp_path}/c.db")
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    engine.dispose()
    return configuracoes


@pytest.fixture
def uow(configuracoes):
    return UnidadeDeTrabalhoSqlAlchemy(
        criar_fabrica_de_sessoes(criar_engine(configuracoes.url_banco))
    )


def semear_duplicidade(uow):
    from gastoba.domain.email import Email
    from gastoba.domain.usuario import Usuario as U

    usuario = U("Ana", email=Email.de_texto("ana@x.com"))
    conta = Conta(
        usuario.id, "BTG", Dinheiro(0), origem=OrigemDaConta.OPEN_FINANCE, id_externo="c1"
    )
    acao = InvestimentoExterno(
        "aupo11",
        "AUPO11",
        "EQUITY",
        "ETF",
        Dinheiro(278925),
        "{}",
        valor_aplicado=Dinheiro(278925),
    )
    with uow:
        uow.usuarios.salvar(usuario)
        uow.contas.adicionar(conta)
        uow.investimentos.salvar_posicao(usuario.id, acao)
        uow.commit()
    with uow:
        investimento = uow.investimentos.listar_posicoes(usuario.id)[0]
    inicial = MovimentoDeInvestimento.de_saldo_inicial(investimento.id, Dinheiro(278925), DIA)
    compra = MovimentoDeInvestimento(
        conta.id,
        TipoDeMovimento.APORTE,
        Dinheiro(278930),
        "LIQ BOLSA - VISTA BRUTO",
        date(2026, 10, 11),
        investimento_id=investimento.id,
    )
    with uow:
        uow.movimentos_de_investimento.adicionar(inicial)
        uow.movimentos_de_investimento.adicionar(compra)
        uow.destinacoes.adicionar(inicial.id, [ParteDeDestinacao(Tag("a"), Dinheiro(278925))])
        uow.destinacoes.adicionar(compra.id, [ParteDeDestinacao(Tag("a"), Dinheiro(278930))])
        uow.commit()
    return usuario, investimento


def rodar(configuracoes, *argumentos):
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["corrigir-investimentos", "--email", "ana@x.com", *argumentos],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    return codigo, saida.getvalue(), erros.getvalue()


def principal_total(uow, usuario, investimento):
    with uow:
        dele = uow.destinacoes.principais(usuario.id).get(investimento.id, {})
        return sum(v.centavos for v in dele.values())


def test_por_padrao_e_dry_run_e_nao_grava(configuracoes, uow):
    usuario, investimento = semear_duplicidade(uow)

    codigo, saida, erros = rodar(configuracoes)

    assert codigo == 0, erros
    assert "DRY-RUN" in saida and "saldo_inicial_duplicado" in saida
    assert principal_total(uow, usuario, investimento) == 278925 + 278930


def test_aplicar_corrige_e_repetir_nao_muda_mais_nada(configuracoes, uow):
    usuario, investimento = semear_duplicidade(uow)

    codigo, saida, _ = rodar(configuracoes, "--aplicar")
    assert codigo == 0 and "APLICADO" in saida
    assert principal_total(uow, usuario, investimento) == 278930

    _, segunda, _ = rodar(configuracoes, "--aplicar")
    assert "saldo_inicial_duplicado" not in segunda


def test_usuario_inexistente_da_erro(configuracoes):
    codigo, _, erros = rodar(configuracoes, "--email", "outra@x.com")
    assert codigo == 1 and "não encontrado" in erros
    assert Usuario  # o import documenta o tipo usado nas fixtures
