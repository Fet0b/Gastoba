from uuid import uuid4


def test_cor_persistente_normalizada_isolada_e_remocao_idempotente(unidade_de_trabalho):
    from gastoba.application.definir_cor_da_destinacao import DefinirCorDaDestinacao
    from gastoba.application.remover_cor_da_destinacao import RemoverCorDaDestinacao
    from gastoba.domain.cor_da_destinacao import CorDaDestinacao
    from gastoba.domain.tag import Tag

    dono = uuid4()
    DefinirCorDaDestinacao(unidade_de_trabalho).executar(
        dono, " Casa/Escritorio ", CorDaDestinacao.MENTA
    )
    with unidade_de_trabalho as u:
        assert u.cores_das_destinacoes.listar(dono) == {
            Tag("casa/escritorio"): CorDaDestinacao.MENTA
        }
        assert u.cores_das_destinacoes.listar(uuid4()) == {}
    remover = RemoverCorDaDestinacao(unidade_de_trabalho)
    remover.executar(dono, "casa/escritorio")
    remover.executar(dono, "casa/escritorio")
    with unidade_de_trabalho as u:
        assert u.cores_das_destinacoes.listar(dono) == {}
