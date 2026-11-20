from uuid import UUID

from gastoba.domain.excecoes import DestinacaoCadastradaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class ExcluirDestinacaoCadastrada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, destinacao_id: UUID) -> None:
        with self._unidade_de_trabalho as uow:
            uow.destinacoes_cadastradas.bloquear(usuario_id)
            destinacao = uow.destinacoes_cadastradas.obter(usuario_id, destinacao_id)
            if destinacao is None:
                raise DestinacaoCadastradaNaoEncontrada("A caixinha não foi encontrada.")

            destinacao.validar_exclusao(
                uow.destinacoes_cadastradas.tem_referencias(usuario_id, destinacao)
            )
            uow.destinacoes_cadastradas.remover(usuario_id, destinacao_id)
            uow.commit()
