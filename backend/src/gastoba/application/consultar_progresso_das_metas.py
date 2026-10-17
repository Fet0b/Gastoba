from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.mes import Mes
from gastoba.domain.meta import ProgressoDaMeta, ResumoDasMetas
from gastoba.domain.portas import UnidadeDeTrabalho


class ConsultarProgressoDasMetas:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, mes: Mes) -> ResumoDasMetas:
        """A renda do mês (soma dos ganhos) e o progresso de cada categoria que tem meta.

        O mês é do calendário, medido pela ``data`` dos ganhos e dos gastos, em todas as contas.
        """
        with self._unidade_de_trabalho as uow:
            renda = uow.ganhos.somar(usuario_id, mes.inicio, mes.fim)
            gastos = uow.gastos.somar_por_categoria(usuario_id, mes.inicio, mes.fim)
            progressos = tuple(
                ProgressoDaMeta(
                    categoria=meta.categoria,
                    percentual=meta.percentual,
                    renda=renda,
                    gasto=gastos.get(meta.categoria, Dinheiro(0)),
                )
                for meta in uow.metas.listar(usuario_id)
            )
            return ResumoDasMetas(renda=renda, progressos=progressos)
