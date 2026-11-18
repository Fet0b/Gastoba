from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from gastoba.application.definir_destinacoes_do_investimento import (
    DefinirDestinacoesDoInvestimento,
)
from gastoba.application.listar_investimentos import posicoes_do_usuario
from gastoba.application.migrar_investimentos import MigrarInvestimentos
from gastoba.domain.destinacao import Destinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MigracaoInconsistente
from gastoba.domain.operacao import OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.pesos_da_caixinha import ratear_pelos_pesos
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy
from gastoba.infrastructure.relogio_do_sistema import RelogioDoSistema


@pytest.fixture
def cenario(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/backfill.db"
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    command.upgrade(config, "head")
    engine = criar_engine(url)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa = Usuario("Pessoa fictícia")
    with uow as u:
        u.usuarios.garantir(pessoa)
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno(
                "aupo11",
                "AUPO11",
                "EQUITY",
                "ETF",
                Dinheiro(369237),
                '{"quantity": "25"}',
                valor_aplicado=Dinheiro(278925),
            ),
        )
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno("caixa", "Caixinha", "CAIXINHA", None, Dinheiro(1000), "{}"),
        )
        u.commit()
    with uow as u:
        aupo = next(i for i in u.investimentos.listar_posicoes(pessoa.id) if i.nome == "AUPO11")
    DefinirDestinacoesDoInvestimento(uow, RelogioDoSistema()).executar(
        pessoa.id, aupo.id, [Destinacao(Tag("reserva"), 60), Destinacao(Tag("viagem"), 40)]
    )
    yield uow, pessoa, aupo
    engine.dispose()


def _legado(uow, pessoa):
    with uow as u:
        return [
            (p.investimento.nome, p.valor_aplicado, p.rentabilidade, p.destinacoes)
            for p in posicoes_do_usuario(u, pessoa.id)
        ]


def test_valor_aplicado_e_caixinhas_iguais_antes_e_depois(cenario):
    uow, pessoa, _ = cenario
    antes = _legado(uow, pessoa)
    MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    assert _legado(uow, pessoa) == antes


def test_cria_abertura_estimada_sem_somar_o_aporte_associado(cenario):
    uow, pessoa, aupo = cenario
    relatorio = MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        (abertura,) = u.operacoes.listar_da_posicao(pessoa.id, aupo.id)
    assert abertura.tipo == TipoDeOperacao.ABERTURA
    assert abertura.origem == OrigemDaOperacao.ABERTURA
    assert abertura.quantidade == Decimal("25")
    assert abertura.quantidade_estimada
    assert relatorio.aberturas_criadas == 1


def test_alocacoes_reproduzem_cada_caixinha_com_zero_centavo(cenario):
    uow, pessoa, aupo = cenario
    antes = {d.tag: d.valor_atual for p in _legado(uow, pessoa) if p[0] == "AUPO11" for d in p[3]}
    MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        ids = {v: k for k, v in u.alocacoes.ids_das_tags(pessoa.id).items()}
        pesos = {
            ids[a.destinacao_id]: a.peso_centavos
            for a in u.alocacoes.listar_da_posicao(pessoa.id, aupo.id)
        }
    depois = dict(ratear_pelos_pesos(Dinheiro(369237), pesos, Dinheiro(0)))
    assert depois == antes


def test_rodar_duas_vezes_da_o_mesmo_resultado(cenario):
    uow, pessoa, aupo = cenario
    MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    relatorio = MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        assert len(u.operacoes.listar_da_posicao(pessoa.id, aupo.id)) == 1
        assert len(u.alocacoes.listar_da_posicao(pessoa.id, aupo.id)) == 2
    assert relatorio.aberturas_criadas == 0


def test_conta_remunerada_caixinha_fica_fora(cenario):
    uow, pessoa, _ = cenario
    MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        caixa = next(i for i in u.investimentos.listar_posicoes(pessoa.id) if i.tipo == "CAIXINHA")
        assert u.operacoes.listar_da_posicao(pessoa.id, caixa.id) == []
        assert not u.operacoes.garantir_posicao(uuid_outro(), caixa.id)


def uuid_outro():
    from uuid import uuid4

    return uuid4()


def test_sem_aplicar_nada_e_gravado(cenario):
    uow, pessoa, aupo = cenario
    MigrarInvestimentos(uow).executar(pessoa.id, aplicar=False)
    with uow as u:
        assert u.operacoes.listar_da_posicao(pessoa.id, aupo.id) == []
        assert u.alocacoes.listar_da_posicao(pessoa.id, aupo.id) == []


def test_divergencia_de_caixinha_desfaz_tudo(cenario, monkeypatch):
    uow, pessoa, aupo = cenario
    monkeypatch.setattr(
        "gastoba.application.migrar_investimentos.pesos_da_caixinha",
        lambda principais: {t: p.centavos + 1 for t, p in principais.items() if p.centavos > 0},
    )
    with pytest.raises(MigracaoInconsistente):
        MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        assert u.operacoes.listar_da_posicao(pessoa.id, aupo.id) == []
        assert u.alocacoes.listar_da_posicao(pessoa.id, aupo.id) == []


def test_posicao_encerrada_com_principal_nao_derruba_a_migracao(cenario):
    """Produção (2026-11-11): CDB resgatado, saldo zero, principal ainda em uma caixinha. A lista
    "antes" ignora posição encerrada; a conferência não pode tratar `{}` como diferente de zero."""
    uow, pessoa, _ = cenario
    with uow as u:
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno(
                "cdb-encerrado",
                "CDB encerrado",
                "FIXED_INCOME",
                None,
                Dinheiro(10000),
                "{}",
                valor_aplicado=Dinheiro(10000),
            ),
        )
        u.commit()
    with uow as u:
        cdb = next(
            i for i in u.investimentos.listar_posicoes(pessoa.id) if i.nome == "CDB encerrado"
        )
    DefinirDestinacoesDoInvestimento(uow, RelogioDoSistema()).executar(
        pessoa.id, cdb.id, [Destinacao(Tag("patrimônio"), 100)]
    )
    with uow as u:
        u.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno(
                "cdb-encerrado", "CDB encerrado", "FIXED_INCOME", None, Dinheiro(0), "{}"
            ),
        )
        u.commit()
    relatorio = MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    assert relatorio.alocacoes_gravadas >= 1


def _compra_da_corretora(uow, pessoa, posicao, valor, custos=0, dia=3):
    from datetime import date

    from gastoba.domain.operacao import Operacao

    with uow as u:
        u.operacoes.adicionar(
            pessoa.id,
            Operacao(
                posicao_id=posicao.id,
                tipo=TipoDeOperacao.COMPRA,
                data=date(2026, 11, dia),
                quantidade=Decimal("25"),
                valor_bruto=Dinheiro(valor),
                custos=Dinheiro(custos),
                origem=OrigemDaOperacao.PLUGGY,
                id_externo=f"b{dia}",
            ),
        )
        u.commit()


def test_caixinha_com_principal_que_ficaria_zerada_na_tela_desfaz_tudo(cenario):
    """Produção (2026-11-11): o custodyFee inflou o aplicado, a parte sem caixinha cobriu o saldo
    todo e as caixinhas ficaram em R$ 0,00 na tela. A conferência olha o que a tela exibe."""
    uow, pessoa, aupo = cenario
    _compra_da_corretora(uow, pessoa, aupo, valor=278930, custos=400000)
    with pytest.raises(MigracaoInconsistente):
        MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    with uow as u:
        assert u.alocacoes.listar_da_posicao(pessoa.id, aupo.id) == []


def test_compra_nova_sem_caixinha_e_legitima_e_a_segunda_execucao_nao_faz_nada(cenario):
    uow, pessoa, aupo = cenario
    _compra_da_corretora(uow, pessoa, aupo, valor=278925, dia=3)
    _compra_da_corretora(uow, pessoa, aupo, valor=50000, dia=4)
    primeira = MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    segunda = MigrarInvestimentos(uow).executar(pessoa.id, aplicar=True)
    assert primeira.alocacoes_gravadas == 2
    assert segunda.alocacoes_gravadas == 0 and segunda.aberturas_criadas == 0
    with uow as u:
        assert len(u.alocacoes.listar_da_posicao(pessoa.id, aupo.id)) == 2
