from copy import deepcopy
from uuid import uuid4

import pytest

from gastoba.application.criar_destinacao_cadastrada import CriarDestinacaoCadastrada
from gastoba.application.excluir_destinacao_cadastrada import ExcluirDestinacaoCadastrada
from gastoba.application.listar_destinacoes_cadastradas import ListarDestinacoesCadastradas
from gastoba.domain.excecoes import (
    DestinacaoCadastradaNaoEncontrada,
    DestinacaoEmUso,
    DestinacaoJaCadastrada,
    TagInvalida,
)


def test_listar_catalogo_vazio(unidade_de_trabalho):
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(uuid4()) == []


def test_criar_cadastra_so_nome_uuid_e_dono(unidade_de_trabalho):
    usuario_id = uuid4()
    criada = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "  VIAGEM  ")

    assert criada.usuario_id == usuario_id
    assert criada.nome.valor == "viagem"
    assert criada.id.int != 0
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [criada]


def test_catalogo_nao_depende_de_posicoes_ou_contas(unidade_de_trabalho):
    usuario_id = uuid4()

    criada = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "reserva")

    assert criada in ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id)
    assert unidade_de_trabalho.confirmado.contas == {}
    assert unidade_de_trabalho.confirmado.movimentos_de_investimento == {}
    assert unidade_de_trabalho.confirmado.investimentos == {}


def test_nome_duplicado_normalizado_e_recusado_sem_segunda_identidade(unidade_de_trabalho):
    usuario_id = uuid4()
    caso = CriarDestinacaoCadastrada(unidade_de_trabalho)
    primeira = caso.executar(usuario_id, "Viagem")

    with pytest.raises(DestinacaoJaCadastrada):
        caso.executar(usuario_id, "  VIAGEM  ")

    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [primeira]


def test_duas_pessoas_podem_usar_o_mesmo_nome(unidade_de_trabalho):
    caso = CriarDestinacaoCadastrada(unidade_de_trabalho)
    primeira = caso.executar(uuid4(), "viagem")
    segunda = caso.executar(uuid4(), "viagem")

    assert primeira.id != segunda.id
    assert primeira.usuario_id != segunda.usuario_id


def test_nome_invalido_nao_muda_o_catalogo(unidade_de_trabalho):
    usuario_id = uuid4()
    existente = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "casa")
    commits = unidade_de_trabalho.commits

    with pytest.raises(TagInvalida):
        CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "\x00")

    assert unidade_de_trabalho.commits == commits
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [existente]


def test_criar_nao_escreve_nas_portas_financeiras(unidade_de_trabalho):
    usuario_id = uuid4()
    estado_antes = deepcopy(unidade_de_trabalho.confirmado)

    CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "viagem")

    estado_depois = unidade_de_trabalho.confirmado
    for campo in (
        "contas",
        "gastos",
        "ganhos",
        "movimentos_de_investimento",
        "investimentos",
        "destinacoes",
        "realocacoes",
        "coberturas",
        "alocacoes",
        "mudancas_de_fracao",
        "metas",
        "guardados_nas_metas",
        "reversoes_de_classificacao",
    ):
        assert getattr(estado_depois, campo) == getattr(estado_antes, campo)


def test_retry_apos_resposta_perdida_nao_duplica(unidade_de_trabalho):
    usuario_id = uuid4()
    caso = CriarDestinacaoCadastrada(unidade_de_trabalho)
    primeira = caso.executar(usuario_id, "viagem")

    with pytest.raises(DestinacaoJaCadastrada):
        caso.executar(usuario_id, "viagem")

    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [primeira]


def test_excluir_cadastro_sem_uso_remove_somente_o_catalogo(unidade_de_trabalho):
    usuario_id = uuid4()
    destinacao = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "viagem")
    estado_financeiro = deepcopy(unidade_de_trabalho.confirmado)
    commits_antes = unidade_de_trabalho.commits

    assert (
        ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, destinacao.id) is None
    )

    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == []
    assert unidade_de_trabalho.commits == commits_antes + 1
    for campo in (
        "contas",
        "gastos",
        "ganhos",
        "movimentos_de_investimento",
        "investimentos",
        "destinacoes",
        "realocacoes",
        "coberturas",
        "alocacoes",
        "mudancas_de_fracao",
        "metas",
        "guardados_nas_metas",
        "reversoes_de_classificacao",
    ):
        assert getattr(unidade_de_trabalho.confirmado, campo) == getattr(estado_financeiro, campo)


def test_excluir_nao_revela_cadastro_ausente_ou_de_outra_pessoa(unidade_de_trabalho):
    dona, outra = uuid4(), uuid4()
    destinacao = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(dona, "viagem")
    commits_antes = unidade_de_trabalho.commits

    for usuario_id, id in ((outra, destinacao.id), (dona, uuid4())):
        with pytest.raises(DestinacaoCadastradaNaoEncontrada):
            ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, id)

    assert unidade_de_trabalho.commits == commits_antes
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(dona) == [destinacao]
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(outra) == []


@pytest.mark.parametrize(
    "referencia",
    [
        "alocacao",
        "cobertura",
        "realocacao",
        "fracao",
        "cor",
        "marcacao_meta",
        "snapshot",
        "historico_zero",
        "duas_posicoes",
    ],
)
def test_excluir_bloqueia_qualquer_referencia_ou_historico(unidade_de_trabalho, referencia):
    usuario_id = uuid4()
    destinacao = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "viagem")
    unidade_de_trabalho.confirmado.referencias_de_destinacoes_cadastradas.add(destinacao.id)
    estado_antes = deepcopy(unidade_de_trabalho.confirmado)
    commits_antes = unidade_de_trabalho.commits

    with pytest.raises(DestinacaoEmUso):
        ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, destinacao.id)

    assert unidade_de_trabalho.commits == commits_antes
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [destinacao]
    assert unidade_de_trabalho.confirmado == estado_antes


def test_excluir_reserva_antes_de_consultar_referencias_e_commita_apos_remover(
    unidade_de_trabalho, monkeypatch
):
    usuario_id = uuid4()
    destinacao = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "viagem")
    eventos = []
    classe = type(unidade_de_trabalho.destinacoes_cadastradas)
    bloquear, obter, tem_referencias, remover = (
        classe.bloquear,
        classe.obter,
        classe.tem_referencias,
        classe.remover,
    )
    monkeypatch.setattr(
        classe, "bloquear", lambda repo, dono: (eventos.append("bloquear"), bloquear(repo, dono))[1]
    )
    monkeypatch.setattr(
        classe, "obter", lambda repo, dono, id: (eventos.append("obter"), obter(repo, dono, id))[1]
    )
    monkeypatch.setattr(
        classe,
        "tem_referencias",
        lambda repo, dono, item: (eventos.append("referencias"), tem_referencias(repo, dono, item))[
            1
        ],
    )
    monkeypatch.setattr(
        classe,
        "remover",
        lambda repo, dono, id: (eventos.append("remover"), remover(repo, dono, id))[1],
    )
    commit = unidade_de_trabalho.commit
    unidade_de_trabalho.commit = lambda: (eventos.append("commit"), commit())[1]

    ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, destinacao.id)

    assert eventos == ["bloquear", "obter", "referencias", "remover", "obter", "commit"]


def test_excluir_falha_na_consulta_de_referencias_faz_rollback(unidade_de_trabalho, monkeypatch):
    usuario_id = uuid4()
    destinacao = CriarDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, "viagem")
    estado_antes = deepcopy(unidade_de_trabalho.confirmado)
    commits_antes = unidade_de_trabalho.commits
    classe = type(unidade_de_trabalho.destinacoes_cadastradas)
    monkeypatch.setattr(
        classe,
        "tem_referencias",
        lambda *_: (_ for _ in ()).throw(RuntimeError("falha de leitura")),
    )

    with pytest.raises(RuntimeError, match="falha de leitura"):
        ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, destinacao.id)

    assert unidade_de_trabalho.commits == commits_antes
    assert unidade_de_trabalho.confirmado == estado_antes


def test_excluir_apaga_a_cor_junto_e_a_cor_nao_bloqueia(unidade_de_trabalho):
    from gastoba.domain.cor_da_destinacao import CorDaDestinacao

    usuario_id = uuid4()
    caso = CriarDestinacaoCadastrada(unidade_de_trabalho)
    destinacao = caso.executar(usuario_id, "viagem", icone="aviao", cor=CorDaDestinacao.CORAL)
    outra = caso.executar(usuario_id, "casa", cor=CorDaDestinacao.CEU)

    ExcluirDestinacaoCadastrada(unidade_de_trabalho).executar(usuario_id, destinacao.id)

    cores = unidade_de_trabalho.confirmado.cores_das_destinacoes
    assert list(cores.values()) == [CorDaDestinacao.CEU]
    assert ListarDestinacoesCadastradas(unidade_de_trabalho).executar(usuario_id) == [outra]
