import hashlib
import io
import json
from pathlib import Path

import pytest

from gastoba.administracao.comandos import principal
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.portas import InvestimentoExterno
from gastoba.domain.usuario import Usuario
from gastoba.infrastructure.configuracoes import Configuracoes
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.modelos import Base
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

EMAIL = "ana@x.com"


@pytest.fixture
def banco(tmp_path):
    arquivo = Path(tmp_path) / "c.db"
    configuracoes = Configuracoes(url_banco=f"sqlite:///{arquivo}")
    engine = criar_engine(configuracoes.url_banco)
    Base.metadata.create_all(engine)
    uow = UnidadeDeTrabalhoSqlAlchemy(criar_fabrica_de_sessoes(engine))
    usuario = Usuario("Ana", email=Email.de_texto(EMAIL))
    with uow as u:
        u.usuarios.salvar(usuario)
        u.investimentos.salvar_posicao(
            usuario.id,
            InvestimentoExterno(
                "aupo11", "AUPO11", "EQUITY", "ETF", Dinheiro(369237), '{"quantity": "25"}'
            ),
        )
        u.commit()
    engine.dispose()
    return configuracoes, arquivo


def _hash(arquivo):
    return hashlib.sha256(arquivo.read_bytes()).hexdigest()


def _rodar(configuracoes, *argumentos):
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["planejar-migracao-de-investimentos", "--email", EMAIL, *argumentos],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    return codigo, saida.getvalue(), erros.getvalue()


def test_o_arquivo_do_banco_fica_byte_a_byte_igual(banco):
    configuracoes, arquivo = banco
    antes = _hash(arquivo)
    codigo, saida, _ = _rodar(configuracoes)
    assert codigo == 0
    assert "AUPO11" in saida
    assert _hash(arquivo) == antes


def test_duas_execucoes_dao_o_mesmo_relatorio(banco):
    configuracoes, _ = banco
    primeira = _rodar(configuracoes, "--formato", "json")[1]
    segunda = _rodar(configuracoes, "--formato", "json")[1]
    assert primeira == segunda
    dados = json.loads(primeira)
    assert {d["nome"]: d["encontrado"] for d in dados["destaques"]}["AUPO11"] is True


def test_o_banco_so_aceita_leitura(banco):
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    from gastoba.administracao.planejar_migracao import somente_leitura

    configuracoes, _ = banco
    engine = criar_engine(configuracoes.url_banco)
    somente_leitura(engine)
    with pytest.raises(OperationalError), engine.begin() as c:
        c.execute(text("UPDATE investimentos SET saldo_centavos = 0"))
    engine.dispose()


def test_a_saida_nao_traz_ids_nem_tokens(banco):
    configuracoes, _ = banco
    _, saida, erros = _rodar(configuracoes)
    texto = saida + erros
    import re

    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}", texto)
    assert "gsess_" not in texto and "gapi_" not in texto


def test_usuario_inexistente_da_erro_sem_gravar(banco):
    configuracoes, arquivo = banco
    antes = _hash(arquivo)
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["planejar-migracao-de-investimentos", "--email", "outra@x.com"],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    assert codigo == 1
    assert _hash(arquivo) == antes


def test_migrar_sem_aplicar_e_so_simulacao(banco):
    configuracoes, arquivo = banco
    antes = _hash(arquivo)
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["migrar-investimentos", "--email", EMAIL],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    assert codigo == 0
    assert "SIMULAÇÃO" in saida.getvalue()
    assert _hash(arquivo) == antes


def test_relatorio_de_ganhos_nao_grava_e_nao_vaza(banco):
    configuracoes, arquivo = banco
    antes = _hash(arquivo)
    saida, erros = io.StringIO(), io.StringIO()
    codigo = principal(
        ["relatorio-de-ganhos-que-sao-rendimento", "--email", EMAIL],
        configuracoes=configuracoes,
        saida=saida,
        erros=erros,
    )
    assert codigo == 0
    assert "somente leitura" in saida.getvalue()
    assert _hash(arquivo) == antes
