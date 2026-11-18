from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from uuid import UUID

from gastoba.application.listar_investimentos import posicoes_do_usuario
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento, TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho


class VisaoDosInvestimentos(StrEnum):
    DESTINACAO = "destinacao"
    TIPO = "tipo"


@dataclass(frozen=True, slots=True)
class FatiaDeInvestimento:
    """``rotulo`` é a tag ou o tipo; ``None`` na parte sem destinação."""

    rotulo: str | None
    valor: Dinheiro
    cor: CorDaDestinacao | None = None


@dataclass(frozen=True, slots=True)
class ResumoDeInvestimentos:
    total: Dinheiro
    fatias: tuple[FatiaDeInvestimento, ...]
    aportes_sem_destino_total: Dinheiro = Dinheiro(0)
    aportes_sem_destino_quantidade: int = 0


class ResumirInvestimentos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, visao: VisaoDosInvestimentos) -> ResumoDeInvestimentos:
        """A distribuição do saldo atual por destinação (tag) ou por tipo de investimento.

        Maior valor primeiro; no empate, "sem destinação" antes e depois o rótulo crescente. A
        soma das fatias é o saldo total.
        """
        with self._unidade_de_trabalho as uow:
            posicoes = posicoes_do_usuario(uow, usuario_id)
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            partes = uow.destinacoes.do_movimento([m.id for m in movimentos])
            # O aporte criado pela Revisão da bolsa é da posição, sem destinação por escolha.
            casadas = uow.casamentos.transacoes_casadas(usuario_id)
            sem_destino = [
                m
                for m in movimentos
                if m.transacao_importada_id not in casadas
                and m.tipo == TipoDeMovimento.APORTE
                and m.origem != OrigemDoMovimento.SALDO_INICIAL
                and not partes.get(m.id)
            ]
        cores = {}
        por_rotulo: dict[str | None, int] = {}
        for posicao in posicoes:
            if visao == VisaoDosInvestimentos.TIPO:
                rotulo = posicao.investimento.tipo
                por_rotulo[rotulo] = por_rotulo.get(rotulo, 0) + posicao.investimento.saldo.centavos
                continue
            for destinacao in posicao.destinacoes:
                cores[str(destinacao.tag)] = destinacao.cor
                rotulo = None if destinacao.tag is None else destinacao.tag.valor
                por_rotulo[rotulo] = por_rotulo.get(rotulo, 0) + destinacao.valor_atual.centavos
        ordenadas = sorted(
            ((r, c) for r, c in por_rotulo.items() if c > 0),
            key=lambda item: (-item[1], item[0] is not None, item[0] or ""),
        )
        return ResumoDeInvestimentos(
            total=Dinheiro(sum(c for _, c in ordenadas)),
            aportes_sem_destino_total=Dinheiro(sum(m.valor.centavos for m in sem_destino)),
            aportes_sem_destino_quantidade=len(sem_destino),
            fatias=tuple(FatiaDeInvestimento(r, Dinheiro(c), cores.get(r)) for r, c in ordenadas),
        )
