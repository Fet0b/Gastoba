from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from gastoba.application.listar_investimentos import PosicaoDeInvestimento, posicoes_do_usuario
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.movimento_de_investimento import OrigemDoMovimento, TipoDeMovimento
from gastoba.domain.pesos_da_caixinha import pesos_da_caixinha, ratear_pelos_pesos
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.quantidade_observada import quantidade_observada_da_posicao
from gastoba.domain.reconciliacao_de_posicao import TipoDePendencia, reconciliar_por_quantidade
from gastoba.domain.tag import Tag

CASOS_DESTACADOS = ("AUPO11", "AUVP11", "BBAS3", "ITUB4")


@dataclass(frozen=True, slots=True)
class AberturaPlanejada:
    valor: Dinheiro
    data: date
    quantidade: Decimal | None
    # Derivada (quantidade observada menos as operações posteriores): nunca confirmada.
    estimada: bool = True


@dataclass(frozen=True, slots=True)
class CaixinhaNaMigracao:
    tag: Tag | None
    antes: Dinheiro
    depois: Dinheiro


@dataclass(frozen=True, slots=True)
class ItemDaMigracao:
    nome: str
    tipo: str
    saldo: Dinheiro
    quantidade_observada: Decimal | None
    aplicado_antes: Dinheiro | None
    aplicado_depois: Dinheiro
    rentabilidade_antes: str | None
    rentabilidade_depois: str | None
    abertura: AberturaPlanejada | None
    caixinhas: tuple[CaixinhaNaMigracao, ...]
    diferenca_maxima_de_caixinha: Dinheiro
    pendencias: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DestaqueDoRelatorio:
    nome: str
    encontrado: bool


@dataclass(frozen=True, slots=True)
class RelatorioDaMigracao:
    itens: tuple[ItemDaMigracao, ...]
    destaques: tuple[DestaqueDoRelatorio, ...]
    decisoes_pendentes: int
    # Os totais de metas e orçamento seguem lendo os movimentos antigos (RF-023).
    metas_passadas_alteradas: int = 0


class PlanejarMigracaoDeInvestimentos:
    """Simulação só de leitura: o antes × depois de cada investimento. Não grava nada."""

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID) -> RelatorioDaMigracao:
        with self._unidade_de_trabalho as uow:
            vivas = {p.investimento.id: p for p in posicoes_do_usuario(uow, usuario_id)}
            investimentos = uow.investimentos.listar_posicoes(usuario_id)
            externos = {e.id_externo: e for e in uow.investimentos.listar(usuario_id)}
            principais = uow.destinacoes.principais(usuario_id)
            movimentos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
            nomes = {i.nome.upper() for i in investimentos}
            codigos = {(i.codigo or "").upper() for i in investimentos}
            itens = tuple(
                self._item(
                    vivas.get(i.id)
                    or PosicaoDeInvestimento(i, (), valor_aplicado=i.valor_aplicado),
                    externos.get(i.id_externo),
                    principais,
                    movimentos,
                )
                for i in investimentos
            )
        destaques = tuple(
            DestaqueDoRelatorio(
                nome,
                any(nome in n.split() or nome == n for n in nomes) or nome in codigos,
            )
            for nome in CASOS_DESTACADOS
        )
        return RelatorioDaMigracao(
            itens, destaques, sum(1 for i in itens if i.abertura is not None)
        )

    @staticmethod
    def _item(posicao, externo, principais, movimentos) -> ItemDaMigracao:
        investimento = posicao.investimento
        if investimento.tipo == "CAIXINHA":
            return ItemDaMigracao(
                nome=investimento.nome,
                tipo=investimento.tipo,
                saldo=investimento.saldo,
                quantidade_observada=None,
                aplicado_antes=posicao.valor_aplicado,
                aplicado_depois=posicao.valor_aplicado or Dinheiro(0),
                rentabilidade_antes=posicao.rentabilidade,
                rentabilidade_depois=posicao.rentabilidade,
                abertura=None,
                caixinhas=(),
                diferenca_maxima_de_caixinha=Dinheiro(0),
                pendencias=("conta remunerada CAIXINHA: fica fora do modelo novo, nada muda",),
            )
        observada = quantidade_observada_da_posicao(
            investimento.tipo, investimento.saldo, externo.dados if externo else "{}"
        )
        dele = [m for m in movimentos if m.investimento_id == investimento.id]
        iniciais = [m for m in dele if m.origem == OrigemDoMovimento.SALDO_INICIAL]
        associados = [
            m
            for m in dele
            if m.tipo == TipoDeMovimento.APORTE and m.origem != OrigemDoMovimento.SALDO_INICIAL
        ]
        abertura = (
            AberturaPlanejada(
                Dinheiro(sum(m.valor.centavos for m in iniciais)),
                min(m.data for m in iniciais),
                observada,
            )
            if iniciais and observada is not None and observada > 0
            else None
        )
        calculada = observada if abertura and observada is not None else Decimal(0)
        reconciliacao = reconciliar_por_quantidade(observada, calculada)
        pendencias = []
        if observada is None:
            pendencias.append("quantidade desconhecida na corretora: histórico incompleto")
        for pendencia in reconciliacao.pendencias:
            texto = "faltam" if pendencia.tipo == TipoDePendencia.FALTAM_COTAS else "sobram"
            pendencias.append(
                f"{texto} ~{pendencia.quantidade_estimada} cotas: informe data e preço"
            )
        if abertura is not None:
            pendencias.append("quantidade da abertura estimada: confirme")
        if iniciais and observada == 0:
            pendencias.append("posição encerrada: registre o vencimento ou a venda")
        if associados:
            total = Dinheiro(sum(m.valor.centavos for m in associados))
            pendencias.append(
                f"{len(associados)} aporte(s) associado(s), {total}, sem operação da corretora: "
                "sugestão de casamento só depois de sincronizar as operações"
            )
        antes = {c.tag: c.valor_atual for c in posicao.destinacoes}
        pesos = pesos_da_caixinha(principais.get(investimento.id, {}))
        depois = dict(ratear_pelos_pesos(investimento.saldo, pesos, Dinheiro(0)))
        caixinhas = tuple(
            CaixinhaNaMigracao(tag, antes.get(tag, Dinheiro(0)), depois.get(tag, Dinheiro(0)))
            for tag in sorted({*antes, *depois}, key=lambda t: (t is None, t.valor if t else ""))
        )
        diferenca = max((abs(c.antes.centavos - c.depois.centavos) for c in caixinhas), default=0)
        return ItemDaMigracao(
            nome=investimento.nome,
            tipo=investimento.tipo,
            saldo=investimento.saldo,
            quantidade_observada=observada,
            aplicado_antes=posicao.valor_aplicado,
            aplicado_depois=abertura.valor if abertura else Dinheiro(0),
            rentabilidade_antes=posicao.rentabilidade,
            # Sem histórico confirmado não há rentabilidade (RF-010).
            rentabilidade_depois=None,
            abertura=abertura,
            caixinhas=caixinhas,
            diferenca_maxima_de_caixinha=Dinheiro(diferenca),
            pendencias=tuple(pendencias),
        )
