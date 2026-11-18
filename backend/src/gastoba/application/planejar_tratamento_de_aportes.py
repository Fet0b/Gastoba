from dataclasses import dataclass
from uuid import UUID

from gastoba.application.listar_aportes_sem_investimento import ListarAportesSemInvestimento
from gastoba.application.mesclar_aporte_sem_investimento import MesclarAporteSemInvestimento
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho


@dataclass(frozen=True, slots=True)
class MesDaDiferenca:
    mes: str
    quantidade: int
    valor: Dinheiro


@dataclass(frozen=True, slots=True)
class PlanoDeTratamento:
    # Pares (descartado, mantido): o primeiro de cada grupo de duplicados fica, os demais saem.
    mesclas: tuple[tuple[UUID, UUID], ...]
    diferenca_por_mes: tuple[MesDaDiferenca, ...]
    sem_investimento: int


class PlanejarTratamentoDeAportes:
    """O plano das mesclas óbvias (mesma conta, dia e valor) e o efeito retroativo mês a mês em
    ``somar_aportes`` e na Liberdade financeira. Só leitura; ``aplicar`` só registra os tratamentos
    (sem efeito nos totais até a aprovação)."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def planejar(self, usuario_id: UUID) -> PlanoDeTratamento:
        itens = ListarAportesSemInvestimento(self._unidade_de_trabalho).executar(usuario_id)
        grupos: dict[tuple, list] = {}
        for item in itens:
            m = item.movimento
            grupos.setdefault((m.conta_id, m.data, m.valor.centavos), []).append(m)
        mesclas, por_mes = [], {}
        for grupo in grupos.values():
            if len(grupo) < 2:
                continue
            ordenado = sorted(grupo, key=lambda m: str(m.id))
            for descartado in ordenado[1:]:
                mesclas.append((descartado.id, ordenado[0].id))
                chave = descartado.data.strftime("%Y-%m")
                quantidade, valor = por_mes.get(chave, (0, 0))
                por_mes[chave] = (quantidade + 1, valor + descartado.valor.centavos)
        diferenca = tuple(
            MesDaDiferenca(mes, q, Dinheiro(v)) for mes, (q, v) in sorted(por_mes.items())
        )
        return PlanoDeTratamento(tuple(mesclas), diferenca, len(itens))

    def aplicar(self, usuario_id: UUID) -> int:
        plano = self.planejar(usuario_id)
        mesclar = MesclarAporteSemInvestimento(self._unidade_de_trabalho, self._relogio)
        for descartado, mantido in plano.mesclas:
            mesclar.executar(usuario_id, descartado, mantido)
        return len(plano.mesclas)
