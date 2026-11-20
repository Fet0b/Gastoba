from uuid import UUID

from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.destinacao_cadastrada import DestinacaoCadastrada, IconeDaCaixinha
from gastoba.domain.portas import UnidadeDeTrabalho


class CriarDestinacaoCadastrada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        nome: str,
        icone: IconeDaCaixinha | str | None = None,
        cor: CorDaDestinacao | None = None,
    ) -> DestinacaoCadastrada:
        destinacao = DestinacaoCadastrada.criar(usuario_id, nome, icone=icone, cor=cor)
        with self._unidade_de_trabalho as uow:
            uow.destinacoes_cadastradas.bloquear(usuario_id)
            uow.destinacoes_cadastradas.adicionar(destinacao)
            if cor is not None:
                uow.cores_das_destinacoes.definir(usuario_id, destinacao.nome, cor)
            uow.commit()
        return destinacao
