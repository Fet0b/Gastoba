"""Repositório e migration das mudanças de fração das caixinhas (072)."""

from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gastoba.domain.alocacao_de_caixinha import AlocacaoDeCaixinha
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.mudanca_de_fracao import MudancaDeFracao
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.tag import Tag
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import obter_configuracoes
from gastoba.infrastructure.persistencia.modelos import CadastroDeDestinacaoModelo
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

RESERVA, CELULAR = Tag("reserva"), Tag("celular")


def _pessoa_com_posicao(fabrica, nome="Pessoa exemplo"):
    pessoa = Usuario(nome)
    uow = UnidadeDeTrabalhoSqlAlchemy(fabrica)
    with uow:
        uow.usuarios.garantir(pessoa)
        uow.investimentos.salvar_posicao(
            pessoa.id,
            InvestimentoExterno(
                f"cdb-{pessoa.id}", "CDB", "FIXED_INCOME", "CDB", Dinheiro(1), "{}"
            ),
        )
        uow.commit()
    with fabrica() as sessao:
        for tag in (RESERVA, CELULAR):
            sessao.add(CadastroDeDestinacaoModelo(id=uuid4(), usuario_id=pessoa.id, nome=tag.valor))
        sessao.commit()
    with uow:
        posicao = uow.investimentos.listar_posicoes(pessoa.id)[0]
    return pessoa, uow, posicao


def test_grava_lista_obtem_e_exclui_pelo_dono(fabrica_de_sessoes):
    pessoa, uow, posicao = _pessoa_com_posicao(fabrica_de_sessoes)
    realocacao = MudancaDeFracao(posicao.id, date(2026, 11, 10), CELULAR, Dinheiro(15000), RESERVA)
    alocacao = MudancaDeFracao(posicao.id, date(2026, 10, 5), RESERVA, Dinheiro(30000))
    with uow:
        uow.mudancas_de_fracao.adicionar(pessoa.id, realocacao)
        uow.mudancas_de_fracao.adicionar(pessoa.id, alocacao)
        uow.commit()
    with uow:
        lidas = uow.mudancas_de_fracao.listar_da_posicao(pessoa.id, posicao.id)
        assert [m.id for m in lidas] == [realocacao.id, alocacao.id]
        lida = uow.mudancas_de_fracao.obter(pessoa.id, realocacao.id)
        assert (lida.posicao_id, lida.data, lida.destino, lida.valor, lida.origem) == (
            posicao.id,
            date(2026, 11, 10),
            CELULAR,
            Dinheiro(15000),
            RESERVA,
        )
        assert uow.mudancas_de_fracao.obter(pessoa.id, alocacao.id).origem is None
        no_mes = uow.mudancas_de_fracao.listar_no_periodo(
            pessoa.id, date(2026, 11, 1), date(2026, 11, 30)
        )
        assert [m.id for m in no_mes] == [realocacao.id]
        uow.mudancas_de_fracao.excluir(pessoa.id, realocacao.id)
        uow.commit()
    with uow:
        assert uow.mudancas_de_fracao.obter(pessoa.id, realocacao.id) is None
        assert len(uow.mudancas_de_fracao.listar_da_posicao(pessoa.id, posicao.id)) == 1


def test_outra_pessoa_nao_ve_nao_grava_nem_exclui(fabrica_de_sessoes):
    pessoa, uow, posicao = _pessoa_com_posicao(fabrica_de_sessoes)
    outra, _, _ = _pessoa_com_posicao(fabrica_de_sessoes, "Outra pessoa")
    mudanca = MudancaDeFracao(posicao.id, date(2026, 11, 10), CELULAR, Dinheiro(100), RESERVA)
    with uow:
        uow.mudancas_de_fracao.adicionar(outra.id, mudanca)  # posição não é dela: ignora
        uow.commit()
    with uow:
        assert uow.mudancas_de_fracao.obter(pessoa.id, mudanca.id) is None
        uow.mudancas_de_fracao.adicionar(pessoa.id, mudanca)
        uow.commit()
    with uow:
        assert uow.mudancas_de_fracao.obter(outra.id, mudanca.id) is None
        assert uow.mudancas_de_fracao.listar_da_posicao(outra.id, posicao.id) == []
        assert uow.mudancas_de_fracao.listar_no_periodo(outra.id, date.min, date.max) == []
        uow.mudancas_de_fracao.excluir(outra.id, mudanca.id)
        uow.commit()
    with uow:
        assert uow.mudancas_de_fracao.obter(pessoa.id, mudanca.id) is not None


def test_checks_recusam_valor_nao_positivo_e_origem_igual_ao_destino(fabrica_de_sessoes):
    pessoa, uow, posicao = _pessoa_com_posicao(fabrica_de_sessoes)
    with uow:
        uow.mudancas_de_fracao.adicionar(
            pessoa.id, MudancaDeFracao(posicao.id, date(2026, 11, 1), CELULAR, Dinheiro(1))
        )
        uow.commit()
    with fabrica_de_sessoes() as sessao:
        for sql in (
            "UPDATE mudancas_de_fracao SET valor_centavos = 0",
            "UPDATE mudancas_de_fracao SET destinacao_origem_id = destinacao_destino_id",
        ):
            with pytest.raises(IntegrityError):
                sessao.execute(text(sql))
            sessao.rollback()


def test_substituir_tira_a_caixinha_zerada_e_cria_a_nova(fabrica_de_sessoes):
    pessoa, uow, posicao = _pessoa_com_posicao(fabrica_de_sessoes)
    with uow:
        ids = uow.alocacoes.ids_das_tags(pessoa.id)
        uow.operacoes.garantir_posicao(pessoa.id, posicao.id)
        uow.alocacoes.substituir(
            pessoa.id, posicao.id, [AlocacaoDeCaixinha(posicao.id, ids[RESERVA], 100)]
        )
        uow.commit()
    with uow:
        uow.alocacoes.substituir(
            pessoa.id, posicao.id, [AlocacaoDeCaixinha(posicao.id, ids[CELULAR], 100)]
        )
        uow.commit()
    with uow:
        assert [
            (a.destinacao_id, a.peso_centavos)
            for a in uow.alocacoes.listar_da_posicao(pessoa.id, posicao.id)
        ] == [(ids[CELULAR], 100)]


def _config(monkeypatch, url):
    monkeypatch.setenv("GASTOBA_URL_BANCO", url)
    obter_configuracoes.cache_clear()
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[2] / "migrations")
    )
    return config


ANTERIOR = "f68000000001"
NOVA = "f72000000001"


def test_migration_so_cria_a_tabela_preserva_os_dados_e_o_downgrade_remove(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/m.db"
    config = _config(monkeypatch, url)
    engine = create_engine(url)
    try:
        command.upgrade(config, ANTERIOR)
        with engine.begin() as c:
            c.execute(text("INSERT INTO usuarios(id,nome) VALUES ('0' || hex(randomblob(15)),'P')"))
        antes = set(inspect(engine).get_table_names())
        with engine.connect() as c:
            usuarios_antes = c.execute(text("SELECT id, nome FROM usuarios")).all()
        command.upgrade(config, NOVA)
        depois = set(inspect(create_engine(url)).get_table_names())
        assert depois - antes == {"mudancas_de_fracao"}
        with engine.connect() as c:
            assert c.execute(text("SELECT id, nome FROM usuarios")).all() == usuarios_antes
            assert c.execute(text("SELECT count(*) FROM mudancas_de_fracao")).scalar() == 0
        command.downgrade(config, ANTERIOR)
        assert set(inspect(create_engine(url)).get_table_names()) == antes
    finally:
        engine.dispose()
