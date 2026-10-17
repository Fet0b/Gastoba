from gastoba.application.obter_usuario_padrao import ObterUsuarioPadrao
from gastoba.domain.usuario import ID_USUARIO_PADRAO, Usuario


def test_primeira_chamada_cria_usuario_padrao_com_nome_recebido(unidade_de_trabalho):
    usuario = ObterUsuarioPadrao(unidade_de_trabalho, nome_padrao="Fulano").executar()

    assert usuario.id == ID_USUARIO_PADRAO
    assert usuario.nome == "Fulano"
    assert unidade_de_trabalho.commits == 1
    assert unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO].nome == "Fulano"


def test_duas_chamadas_com_a_mesma_unidade_de_trabalho_deixam_um_unico_usuario(
    unidade_de_trabalho,
):
    caso_de_uso = ObterUsuarioPadrao(unidade_de_trabalho, nome_padrao="Fulano")

    primeiro = caso_de_uso.executar()
    segundo = caso_de_uso.executar()

    assert primeiro.id == segundo.id == ID_USUARIO_PADRAO
    assert list(unidade_de_trabalho.confirmado.usuarios) == [ID_USUARIO_PADRAO]
    assert unidade_de_trabalho.commits == 1


def test_usuario_existente_mantem_o_nome_original(unidade_de_trabalho):
    unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO] = Usuario(
        "Original", id=ID_USUARIO_PADRAO
    )

    usuario = ObterUsuarioPadrao(unidade_de_trabalho, nome_padrao="Outro").executar()

    assert usuario.nome == "Original"
    assert unidade_de_trabalho.confirmado.usuarios[ID_USUARIO_PADRAO].nome == "Original"
    assert unidade_de_trabalho.commits == 0
