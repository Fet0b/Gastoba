from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import MovimentoDeInvestimentoNaoEncontrado, ReaplicacaoInvalida
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.reaplicacao_de_resgate import validar_reaplicacao


@dataclass(frozen=True, slots=True)
class ResgateParaReaplicar:
    movimento: MovimentoDeInvestimento
    investimento_nome: str
    disponivel: Dinheiro


class ListarResgatesParaReaplicar:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, aporte_id: UUID) -> list[ResgateParaReaplicar]:
        with self._unidade_de_trabalho as uow:
            aporte = uow.movimentos_de_investimento.obter(usuario_id, aporte_id)
            if aporte is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Aporte não encontrado.")
            if uow.reaplicacoes_de_resgates.para_movimento(usuario_id, aporte.id):
                return []
            destino = (
                uow.investimentos.obter(usuario_id, aporte.investimento_id)
                if aporte.investimento_id
                else None
            )
            vinculados = {r.resgate_id for r in uow.reaplicacoes_de_resgates.listar(usuario_id)}
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, date.min, aporte.data)
            usados = uow.coberturas.usado_dos_resgates([m.id for m in movimentos])
            candidatos = []
            for resgate in movimentos:
                if resgate.id in vinculados:
                    continue
                origem = (
                    uow.investimentos.obter(usuario_id, resgate.investimento_id)
                    if resgate.investimento_id
                    else None
                )
                coberto = Dinheiro(sum(v.centavos for v in usados.get(resgate.id, {}).values()))
                livre = resgate.valor - coberto
                try:
                    validar_reaplicacao(resgate, aporte, origem, destino, Dinheiro(1), coberto)
                except ReaplicacaoInvalida:
                    continue
                candidatos.append(ResgateParaReaplicar(resgate, origem.nome, livre))
            return candidatos
