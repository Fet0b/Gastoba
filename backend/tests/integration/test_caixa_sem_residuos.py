"""069 (CS-001): no banco populado, o que a pessoa já tratou não deixa resíduo de investimento."""

from datetime import date

import pytest

from dados_de_teste.popular import EMAIL_DA_DONA, popular
from gastoba.application.aceitar_transacao_importada import AceitarTransacaoImportada
from gastoba.application.listar_resgates_sem_destinacao import ListarResgatesSemDestinacao
from gastoba.application.listar_revisao_da_bolsa import ListarRevisaoDaBolsa
from gastoba.application.listar_transacoes_importadas import ListarTransacoesImportadas
from gastoba.domain.email import Email
from gastoba.domain.excecoes import TransacaoImportadaInvalida
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.infrastructure.persistencia.banco import criar_engine, criar_fabrica_de_sessoes
from gastoba.infrastructure.persistencia.unidade_de_trabalho import UnidadeDeTrabalhoSqlAlchemy

HOJE = date(2026, 11, 15)
AMBIENTE = {"GASTOBA_AMBIENTE_DE_TESTE": "true"}


@pytest.fixture(scope="module")
def ambiente(tmp_path_factory):
    url = f"sqlite:///{tmp_path_factory.mktemp('residuos')}/teste.db"
    popular(url, HOJE, ambiente=AMBIENTE)
    engine = criar_engine(url)
    fabrica = criar_fabrica_de_sessoes(engine)

    def uow():
        return UnidadeDeTrabalhoSqlAlchemy(fabrica)

    with uow() as u:
        dona = u.usuarios.obter_por_email(Email.de_texto(EMAIL_DA_DONA)).id
    yield uow, dona
    engine.dispose()


def test_a_caixa_nao_guarda_vencimento_juros_nem_imposto_ja_tratados(ambiente):
    uow, dona = ambiente
    pendentes = [i.transacao for i in ListarTransacoesImportadas(uow()).executar(dona)]
    descricoes = " ".join(t.descricao for t in pendentes)
    assert "TESOURO PREFIXADO" not in descricoes
    assert "RENDIMENTO CONTA" not in descricoes


def test_o_sino_nao_lista_resgate_ligado_pela_revisao_nem_vencimento_sem_caixinhas(ambiente):
    uow, dona = ambiente
    with uow() as u:
        casadas = u.casamentos.transacoes_casadas(dona)
    avisos = ListarResgatesSemDestinacao(uow()).executar(dona)
    assert all(a.movimento.transacao_importada_id not in casadas for a in avisos)
    # O resgate do título vencido sem caixinhas foi aceito na caixa (D1) e sai do sino só com o
    # vencimento confirmado (D2): enquanto não, ele é o único que ainda pede decisão.
    assert len(avisos) <= 1


def test_a_revisao_da_bolsa_nao_tem_proposta_exata_pendente(ambiente):
    uow, dona = ambiente
    revisao = ListarRevisaoDaBolsa(uow()).executar(dona)
    assert [p for p in revisao.propostas if p.proposta.confianca == "exata"] == []


def test_toda_pendente_de_bolsa_so_aceita_como_investimento_e_a_liquidacao_nunca_como_gasto(
    ambiente,
):
    uow, dona = ambiente
    brutas = [
        i.transacao
        for i in ListarTransacoesImportadas(uow()).executar(dona)
        if natureza_da_descricao(i.transacao.descricao) == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA
        and "BRUTO" in i.transacao.descricao
    ]
    assert brutas, "o cenário precisa deixar uma liquidação bruta pendente"
    for t in brutas:
        with pytest.raises(TransacaoImportadaInvalida, match="Revisão da bolsa"):
            AceitarTransacaoImportada(uow()).executar(dona, t.id, None, [])
        with pytest.raises(TransacaoImportadaInvalida):
            AceitarTransacaoImportada(uow()).executar(dona, t.id, _categoria(), [])


def _categoria():
    from gastoba.domain.categoria import CategoriaDoGasto

    return CategoriaDoGasto.LAZER
