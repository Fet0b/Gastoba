import re
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.ganho import OrigemDoGanho
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.texto import normalizar_texto

_PALAVRAS = re.compile(r"\b(rendimentos?|rend|cdb|rdb|lci|lca|resgate)\b")


@dataclass(frozen=True, slots=True)
class MesDoRelatorio:
    mes: str
    # Ganhos do Open Finance que parecem rendimento de título, não renda nova.
    candidatos: int
    valor_dos_candidatos: Dinheiro
    renda: Dinheiro
    renda_sem_candidatos: Dinheiro


@dataclass(frozen=True, slots=True)
class RelatorioDeGanhosQueSaoRendimentoResultado:
    meses: tuple[MesDoRelatorio, ...]

    @property
    def total_de_candidatos(self) -> int:
        return sum(m.candidatos for m in self.meses)


class RelatorioDeGanhosQueSaoRendimento:
    """Só leitura: quantos ganhos do Open Finance parecem ser rendimento de título (e não renda
    nova) e o efeito mês a mês na renda e nas metas. **Não altera nada**: reclassificar é decisão
    da pessoa, caso a caso, e meses passados só mudam com aprovação (RF-023).

    Candidato = ganho do Open Finance, não gerado por recorrência, que cai no dia de um resgate da
    mesma conta **ou** cuja descrição fala de rendimento, CDB, RDB, LCI, LCA ou resgate.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> RelatorioDeGanhosQueSaoRendimentoResultado:
        with self._unidade_de_trabalho as uow:
            ganhos = uow.ganhos.listar(usuario_id, date.min, date.max, None)
            dias_de_resgate = {
                (m.conta_id, m.data)
                for m in uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
                if m.tipo == TipoDeMovimento.RESGATE
            }
        por_mes: dict[str, list] = {}
        for ganho in ganhos:
            por_mes.setdefault(ganho.data.strftime("%Y-%m"), []).append(ganho)
        meses = []
        for mes, do_mes in sorted(por_mes.items()):
            candidatos = [
                g
                for g in do_mes
                if g.origem == OrigemDoGanho.OPEN_FINANCE
                and g.recorrencia_id is None
                and (
                    (g.conta_id, g.data) in dias_de_resgate
                    or _PALAVRAS.search(normalizar_texto(g.descricao))
                )
            ]
            renda = Dinheiro(sum(g.valor.centavos for g in do_mes))
            valor = Dinheiro(sum(g.valor.centavos for g in candidatos))
            meses.append(MesDoRelatorio(mes, len(candidatos), valor, renda, renda - valor))
        return RelatorioDeGanhosQueSaoRendimentoResultado(tuple(meses))
