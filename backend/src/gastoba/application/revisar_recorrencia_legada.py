from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.excecoes import RecorrenciaNaoEncontrada, RevisaoNaoPendente
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.recorrencia import Recorrencia


class RevisarRecorrenciaLegada:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, id: UUID, categoria: CategoriaDoGasto) -> Recorrencia:
        with self._unidade_de_trabalho as uow:
            registro = uow.recorrencias.obter(usuario_id, id)
            if registro is None:
                raise RecorrenciaNaoEncontrada("Registro não encontrado.")
            if registro.categoria != CategoriaDoGasto.INVESTIMENTOS:
                raise RevisaoNaoPendente("Este registro não está pendente de revisão.")
            exigir_categoria_ativa(categoria)
            uow.recorrencias.alterar_categoria(id, categoria)
            registro.categoria = categoria
            uow.commit()
            return registro
