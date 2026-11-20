from uuid import UUID

from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada, IconeDaCaixinha
from gastoba.domain.excecoes import DestinacaoCadastradaNaoEncontrada
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirIconeDaCaixinha:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self, usuario_id: UUID, destinacao_id: UUID, icone: IconeDaCaixinha | str | None
    ) -> DestinacaoCadastrada:
        with self._unidade_de_trabalho as uow:
            uow.destinacoes_cadastradas.bloquear(usuario_id)
            destinacao = uow.destinacoes_cadastradas.obter(usuario_id, destinacao_id)
            if destinacao is None:
                raise DestinacaoCadastradaNaoEncontrada("A caixinha não foi encontrada.")
            atualizada = destinacao.com_icone(icone)
            uow.destinacoes_cadastradas.definir_icone(usuario_id, destinacao_id, atualizada.icone)
            uow.commit()
        return atualizada
