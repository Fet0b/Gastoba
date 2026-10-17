from datetime import timedelta
from uuid import uuid4

from gastoba.application.criar_chave_de_api import CriarChaveDeApi
from gastoba.application.listar_chaves_de_api import ListarChavesDeApi
from gastoba.application.revogar_chave_de_api import RevogarChaveDeApi
from gastoba.domain.chave_de_api import EscopoDaChave

USUARIO_ID = uuid4()


def test_lista_as_chaves_nao_revogadas_do_usuario_da_mais_nova_para_a_mais_antiga(
    unidade_de_trabalho, gerador, relogio
):
    criar = CriarChaveDeApi(unidade_de_trabalho, gerador, relogio)
    antiga = criar.executar(USUARIO_ID, nome="Antiga", escopo=EscopoDaChave.LEITURA).chave
    relogio.avancar(timedelta(minutes=1))
    nova = criar.executar(USUARIO_ID, nome="Nova", escopo=EscopoDaChave.ESCRITA).chave
    revogada = criar.executar(USUARIO_ID, nome="Revogada", escopo=EscopoDaChave.LEITURA).chave
    RevogarChaveDeApi(unidade_de_trabalho).executar(USUARIO_ID, revogada.id)
    criar.executar(uuid4(), nome="De outro", escopo=EscopoDaChave.LEITURA)

    chaves = ListarChavesDeApi(unidade_de_trabalho).executar(USUARIO_ID)

    assert [c.id for c in chaves] == [nova.id, antiga.id]


def test_usuario_sem_chaves_recebe_lista_vazia(unidade_de_trabalho):
    assert ListarChavesDeApi(unidade_de_trabalho).executar(USUARIO_ID) == []
