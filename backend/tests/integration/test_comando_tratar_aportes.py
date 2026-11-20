import hashlib
import io
from datetime import date
from pathlib import Path

import pytest

from gastoba.administracao.comandos import principal
from gastoba.domain.conta import Conta
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

EMAIL = "ana@x.com"
DIA = date(2026, 10, 27)


@pytest.fixture
def banco(tmp_path):
    arquivo = Path(tmp_path) / "t.db"
    configuracoes = Configuracoes(url_banco=f"sqlite:///{arquivo}")
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    pessoa = Usuario("Ana", email=Email.de_texto(EMAIL))
    conta = Conta(pessoa.id, "Banco", Dinheiro(0))
    with uow as u:
        u.usuarios.salvar(pessoa)
        u.contas.adicionar(conta)
        for _ in range(2):
            u.movimentos_de_investimento.adicionar(
                MovimentoDeInvestimento(conta.id, TipoDeMovimento.APORTE, Dinheiro(14313), "A", DIA)
            )
        u.commit()
    engine.dispose()
    return configuracoes, arquivo, pessoa


def _rodar(configuracoes, *args):
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["tratar-aportes-sem-investimento", "--email", EMAIL, *args],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    return codigo, saida.getvalue(), erros.getvalue()


def _hash(arquivo):
    return hashlib.sha256(arquivo.read_bytes()).hexdigest()


def _soma(configuracoes, pessoa):
    engine = criar_engine(configuracoes.url_banco)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    with uow as u:
        total = u.movimentos_de_investimento.somar_aportes(pessoa.id, DIA, DIA)
    engine.dispose()
    return total


def test_dry_run_e_o_padrao_e_nao_grava(banco):
    configuracoes, arquivo, _ = banco
    antes = _hash(arquivo)
    codigo, saida, _ = _rodar(configuracoes)
    assert codigo == 0
    assert "SIMULAÇÃO" in saida and "Mesclas óbvias (mesma conta, dia e valor): 1" in saida
    assert "2026-10" in saida
    assert _hash(arquivo) == antes


def test_aplicar_registra_sem_mudar_o_total_e_aprovar_muda(banco):
    configuracoes, _, pessoa = banco
    assert _soma(configuracoes, pessoa) == Dinheiro(28626)
    assert _rodar(configuracoes, "--aplicar")[0] == 0
    assert _soma(configuracoes, pessoa) == Dinheiro(28626)  # sem aprovação nada muda
    assert _rodar(configuracoes, "--aprovar")[0] == 0
    assert _soma(configuracoes, pessoa) == Dinheiro(14313)


def test_aprovar_antes_de_aplicar_e_recusado(banco):
    configuracoes, _, pessoa = banco
    codigo, _, erros = _rodar(configuracoes, "--aprovar")
    assert codigo == 1 and "--aplicar" in erros
    assert _soma(configuracoes, pessoa) == Dinheiro(28626)


def test_a_saida_nao_traz_ids(banco):
    import re

    configuracoes, _, _ = banco
    _, saida, erros = _rodar(configuracoes)
    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}", saida + erros)
