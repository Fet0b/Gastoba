from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.domain.casamento_de_operacao import PapelDoVinculo
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PeriodoInvalido
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


@dataclass(frozen=True, slots=True)
class MovimentoComDestinacoes:
    movimento: MovimentoDeInvestimento
    # Valores sempre positivos; o tipo do movimento diz se entrou ou saiu.
    destinacoes: tuple[tuple[Tag, Dinheiro], ...]
    # A categoria que cada parte guardou do vínculo da caixinha (só as partes que têm).
    categorias: tuple[tuple[Tag, CategoriaDoGasto], ...] = ()
    # No resgate, o dinheiro de cada tag que compras já usaram (só as tags usadas).
    cobertos: tuple[tuple[Tag, Dinheiro], ...] = ()
    # A ligação (Revisão da bolsa) a que o movimento pertence, se houver.
    casamento_id: UUID | None = None


class ListarMovimentosDeInvestimento:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, inicio: date, fim: date) -> list[MovimentoComDestinacoes]:
        if inicio > fim:
            raise PeriodoInvalido("O início do período não pode ser depois do fim.")
        with self._unidade_de_trabalho as uow:
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, inicio, fim)
            partes = uow.destinacoes.do_movimento([m.id for m in movimentos])
            categorias = uow.destinacoes.categorias_das_partes([m.id for m in movimentos])
            cobertos = uow.coberturas.usado_dos_resgates([m.id for m in movimentos])
            do_casamento = {
                v.transacao_importada_id: c.id
                for c in uow.casamentos.listar(usuario_id)
                for v in c.vinculos
                if v.papel == PapelDoVinculo.BRUTO
            }
            return [
                MovimentoComDestinacoes(
                    m,
                    tuple(
                        (tag, Dinheiro(abs(valor.centavos))) for tag, valor in partes.get(m.id, [])
                    ),
                    tuple(categorias.get(m.id, {}).items()),
                    tuple(cobertos.get(m.id, {}).items()),
                    do_casamento.get(m.transacao_importada_id),
                )
                for m in movimentos
            ]
