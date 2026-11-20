from uuid import UUID

from gastoba.domain.categoria import CategoriaDoGasto, exigir_categoria_ativa
from gastoba.domain.cobertura_de_compra import ReservaDaDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import UnidadeDeTrabalho


class ListarReservasDasDestinacoes:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, categoria: CategoriaDoGasto) -> list[ReservaDaDestinacao]:
        exigir_categoria_ativa(categoria)
        with self._unidade_de_trabalho as uow:
            cores = uow.cores_das_destinacoes.listar(usuario_id)
            reservado = uow.destinacoes.somar_reservado_por_tag(usuario_id, categoria)
            coberto = uow.coberturas.somar_coberto_por_tag(usuario_id, categoria)
            reservas = [
                ReservaDaDestinacao(categoria, t, v, coberto.get(t, Dinheiro(0)), cores.get(t))
                for t, v in reservado.items()
                if v.centavos > 0
            ]
            return sorted(reservas, key=lambda r: (-r.disponivel.centavos, str(r.tag)))
