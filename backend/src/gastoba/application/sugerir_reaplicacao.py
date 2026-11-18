from collections import Counter
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from gastoba.application.listar_investimentos import _com_custo_de_fonte_unica
from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.casamento_de_operacao import PapelDoVinculo
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento, TipoDeMovimento
from gastoba.domain.operacao import TipoDeOperacao
from gastoba.domain.portas import UnidadeDeTrabalho


@dataclass(frozen=True, slots=True)
class SugestaoDeReaplicacao:
    operacao_id: UUID
    aporte_id: UUID
    valor: Dinheiro


class SugerirReaplicacao:
    """Sugere o destino do líquido de um resgate casado, sem criar vínculo nem movimento.

    O aporte ainda sem investimento precisa ser associado antes da confirmação pela 057.
    Ambiguidade em qualquer ponta impede a sugestão.
    """

    def __init__(
        self, unidade_de_trabalho: UnidadeDeTrabalho, tolerancia: Tolerancia | None = None
    ):
        self._unidade_de_trabalho = unidade_de_trabalho
        self._tolerancia = tolerancia or Tolerancia()

    def executar(self, usuario_id: UUID) -> list[SugestaoDeReaplicacao]:
        with self._unidade_de_trabalho as uow:
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            vinculados = {r.aporte_id for r in uow.reaplicacoes_de_resgates.listar(usuario_id)}
            candidatos = []
            for posicao in uow.investimentos.listar_posicoes(usuario_id):
                if posicao.tipo == "CAIXINHA":
                    continue
                for operacao in _com_custo_de_fonte_unica(
                    uow, usuario_id, uow.operacoes.listar_da_posicao(usuario_id, posicao.id)
                ):
                    if operacao.tipo not in (TipoDeOperacao.VENDA, TipoDeOperacao.VENCIMENTO):
                        continue
                    casamento = uow.casamentos.para_operacao(usuario_id, operacao.id)
                    if casamento is None:
                        continue
                    creditos = [
                        uow.transacoes_importadas.obter(usuario_id, v.transacao_importada_id)
                        for v in casamento.vinculos
                        if v.papel == PapelDoVinculo.BRUTO
                    ]
                    if not creditos or any(t is None for t in creditos):
                        continue
                    contas = {t.conta_id for t in creditos}
                    if len(contas) != 1:
                        continue
                    data = max(t.data for t in creditos)
                    liquido = operacao.valor_bruto - operacao.custos
                    if liquido.centavos <= 0:
                        continue
                    iguais = [
                        m
                        for m in movimentos
                        if m.tipo == TipoDeMovimento.APORTE
                        and m.origem != OrigemDoMovimento.SALDO_INICIAL
                        and m.investimento_id is None
                        and m.conta_id in contas
                        and m.id not in vinculados
                        and 0 <= (m.data - data).days <= self._tolerancia.dias
                        and abs(m.valor.centavos - liquido.centavos) <= self._tolerancia.centavos
                    ]
                    if len(iguais) == 1:
                        candidatos.append(SugestaoDeReaplicacao(operacao.id, iguais[0].id, liquido))
            usos = Counter(s.aporte_id for s in candidatos)
            return [s for s in candidatos if usos[s.aporte_id] == 1]
