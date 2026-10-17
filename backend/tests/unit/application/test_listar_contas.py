from uuid import uuid4

from gastoba.application.listar_contas import ListarContas

USUARIO_ID = uuid4()


def test_lista_so_as_contas_do_usuario_ordenadas_por_nome(unidade_de_trabalho, semear_conta):
    semear_conta(usuario_id=USUARIO_ID, nome="Nubank")
    semear_conta(usuario_id=USUARIO_ID, nome="Carteira")
    semear_conta(usuario_id=uuid4(), nome="Alheia")

    contas = ListarContas(unidade_de_trabalho).executar(USUARIO_ID)

    assert [c.nome for c in contas] == ["Carteira", "Nubank"]
    assert all(c.usuario_id == USUARIO_ID for c in contas)
    assert unidade_de_trabalho.commits == 0


def test_usuario_sem_contas_recebe_lista_vazia(unidade_de_trabalho, semear_conta):
    semear_conta(usuario_id=uuid4(), nome="Alheia")

    assert ListarContas(unidade_de_trabalho).executar(USUARIO_ID) == []
