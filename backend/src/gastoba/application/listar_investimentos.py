import json
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from gastoba.domain.casamento_de_operacao import PapelDoVinculo
from gastoba.domain.cor_da_destinacao import CorDaDestinacao
from gastoba.domain.custo_medio import calcular_posicao, custo_de_fonte_unica
from gastoba.domain.destinacao import ratear_saldo
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.investimento import (
    Investimento,
    apurar_resultado_realizado,
    parte_sem_caixinha_do_rateio,
    rentabilidade_em_percentual,
)
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.operacao import Operacao, TipoDeOperacao
from gastoba.domain.pesos_da_caixinha import ratear_pelos_pesos
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.quantidade_observada import quantidade_observada_da_posicao
from gastoba.domain.reconciliacao_de_posicao import (
    PendenciaDeReconciliacao,
    ResultadoDaReconciliacao,
    TipoDePendencia,
    historico_das_operacoes,
)
from gastoba.domain.rentabilidade import (
    FluxoDeCaixa,
    RentabilidadeIndisponivel,
    RentabilidadeXirr,
    calcular_rentabilidade,
)
from gastoba.domain.tag import Tag


@dataclass(frozen=True, slots=True)
class DestinacaoDoInvestimento:
    """``tag`` é ``None`` na parte do saldo que ainda não tem destinação."""

    tag: Tag | None
    principal: Dinheiro
    valor_atual: Dinheiro
    # ``valor_atual - principal`` e esse ganho sobre o principal (nulo sem principal).
    rendimento: Dinheiro
    rentabilidade: str | None
    cor: CorDaDestinacao | None = None


@dataclass(frozen=True, slots=True)
class PosicaoDeInvestimento:
    investimento: Investimento
    destinacoes: tuple[DestinacaoDoInvestimento, ...]
    # Lucro sobre o valor aplicado, em %. Vem da instituição (``origem_da_rentabilidade``); nulo
    # quando ela não informa.
    rentabilidade: str | None = None
    valor_aplicado: Dinheiro | None = None
    rendimento: Dinheiro | None = None
    origem_da_rentabilidade: str | None = None
    custos_registrados: Dinheiro = Dinheiro(0)
    resultado_realizado: Dinheiro | None = None
    data_de_aplicacao: date | None = None
    # Posição pelas operações: sem histórico completo não há rentabilidade (nunca um número
    # inventado) e a pendência diz o que falta.
    quantidade: Decimal | None = None
    custo_medio: Decimal | None = None
    historico_completo: bool = False
    rentabilidade_do_periodo: Decimal | None = None
    rentabilidade_anualizada: Decimal | None = None
    motivo_sem_rentabilidade: str | None = None
    pendencias: tuple[PendenciaDeReconciliacao, ...] = ()
    pendencias_de_operacoes: tuple[dict[str, str], ...] = ()
    # O que a pessoa deve fazer com o aviso de histórico: ``confirmar_quantidade``, ``completar``,
    # ``conferir_operacoes`` ou nulo (histórico completo, caixinha ou nada a fazer).
    acao_do_historico: str | None = None
    alocacao_por_fracao: bool = False
    # Só com o histórico das operações fechado: custo médio das compras e o lucro sobre ele. O
    # ``valor_aplicado`` da instituição pode estar defasado em relação às operações reais.
    valor_aplicado_das_operacoes: Dinheiro | None = None
    rendimento_das_operacoes: Dinheiro | None = None


class ListarInvestimentos:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(self, usuario_id: UUID, hoje: date | None = None) -> list[PosicaoDeInvestimento]:
        """As posições abertas do usuário, cada uma com o saldo rateado entre as destinações."""
        with self._unidade_de_trabalho as uow:
            return posicoes_do_usuario(uow, usuario_id, hoje)


def _fluxos(operacoes: list[Operacao]) -> list[FluxoDeCaixa]:
    """Dinheiro que saiu do bolso (compra e abertura) ou voltou (venda, vencimento, provento)."""
    fluxos = []
    for o in operacoes:
        if o.tipo in (TipoDeOperacao.COMPRA, TipoDeOperacao.ABERTURA):
            fluxos.append(FluxoDeCaixa(o.data, Dinheiro(-(o.valor_bruto + o.custos).centavos)))
        elif o.tipo in (TipoDeOperacao.VENDA, TipoDeOperacao.VENCIMENTO):
            fluxos.append(FluxoDeCaixa(o.data, o.valor_bruto - o.custos))
        elif o.tipo == TipoDeOperacao.PROVENTO:
            fluxos.append(FluxoDeCaixa(o.data, o.valor_bruto))
    return fluxos


def _com_custo_de_fonte_unica(
    uow: UnidadeDeTrabalho, usuario_id: UUID, operacoes: list[Operacao]
) -> list[Operacao]:
    """D12: o custo vem das despesas da operação ou, se vazias, dos débitos de taxa casados; nunca
    das duas somadas. Nada é gravado: desfazer o casamento tira o custo sozinho."""
    resultado = []
    for operacao in operacoes:
        if operacao.custos.centavos > 0 or operacao.tipo not in (
            TipoDeOperacao.COMPRA,
            TipoDeOperacao.VENDA,
        ):
            resultado.append(operacao)
            continue
        casamento = uow.casamentos.para_operacao(usuario_id, operacao.id)
        debitos = 0
        if casamento is not None:
            for vinculo in casamento.vinculos:
                if vinculo.papel in (PapelDoVinculo.TAXA, PapelDoVinculo.IMPOSTO):
                    transacao = uow.transacoes_importadas.obter(
                        usuario_id, vinculo.transacao_importada_id
                    )
                    debitos += transacao.valor.centavos if transacao else 0
        resultado.append(
            replace(operacao, custos=custo_de_fonte_unica(operacao.custos, Dinheiro(debitos)))
        )
    return resultado


def _acao_do_historico(
    investimento: Investimento,
    operacoes: list[Operacao],
    reconciliacao: ResultadoDaReconciliacao,
    pendencias_de_operacoes: list[dict[str, str]],
) -> str | None:
    if reconciliacao.historico_completo or investimento.tipo == "CAIXINHA":
        return None
    if any(o.quantidade_estimada for o in operacoes):
        return "confirmar_quantidade"
    tipos = {p.tipo for p in reconciliacao.pendencias}
    if TipoDePendencia.SOBRAM_COTAS in tipos or any(
        p.get("motivo") == "possivel_duplicidade" for p in pendencias_de_operacoes
    ):
        return "conferir_operacoes"
    if TipoDePendencia.FALTAM_COTAS in tipos:
        return "completar"
    return None


def _posicao_pelas_operacoes(
    uow: UnidadeDeTrabalho, usuario_id: UUID, investimento: Investimento, dados: str, hoje: date
) -> dict:
    observada = quantidade_observada_da_posicao(investimento.tipo, investimento.saldo, dados)
    operacoes = _com_custo_de_fonte_unica(
        uow, usuario_id, uow.operacoes.listar_da_posicao(usuario_id, investimento.id)
    )
    try:
        calculada = calcular_posicao(operacoes)
    except OperacaoInvalida:
        # Venda maior que a quantidade: o histórico está errado, não a lista.
        return {
            "quantidade": observada,
            "motivo_sem_rentabilidade": "historico_incompleto",
        }
    reconciliacao = historico_das_operacoes(
        observada, calculada.quantidade, any(o.quantidade_estimada for o in operacoes)
    )
    resultado = calcular_rentabilidade(
        RentabilidadeXirr(),
        historico_completo=reconciliacao.historico_completo,
        fluxos=_fluxos(operacoes),
        valor_final=investimento.saldo,
        data_final=hoje,
    )
    indisponivel = isinstance(resultado, RentabilidadeIndisponivel)
    return {
        "quantidade": observada,
        "custo_medio": calculada.custo_medio,
        "historico_completo": reconciliacao.historico_completo,
        "valor_aplicado_das_operacoes": calculada.valor_aplicado
        if reconciliacao.historico_completo
        else None,
        "rendimento_das_operacoes": investimento.saldo - calculada.valor_aplicado
        if reconciliacao.historico_completo
        else None,
        "rentabilidade_do_periodo": None if indisponivel else resultado.periodo,
        "rentabilidade_anualizada": None if indisponivel else resultado.anualizada,
        "motivo_sem_rentabilidade": resultado.motivo if indisponivel else None,
        "pendencias": reconciliacao.pendencias,
        "acao_do_historico": _acao_do_historico(
            investimento,
            operacoes,
            reconciliacao,
            json.loads(dados or "{}").get("gastoba_pendencias_de_operacoes", []),
        ),
    }


def valor_sem_caixinha(
    uow: UnidadeDeTrabalho, usuario_id: UUID, investimento: Investimento, soma_dos_pesos: int
) -> Dinheiro:
    """A parte da posição que ainda não pertence a nenhuma caixinha (compra nova): o custo das
    operações que passa do que as alocações já cobrem. Sem histórico confiável, zero."""
    operacoes = _com_custo_de_fonte_unica(
        uow, usuario_id, uow.operacoes.listar_da_posicao(usuario_id, investimento.id)
    )
    try:
        aplicado = calcular_posicao(operacoes).valor_aplicado.centavos
    except OperacaoInvalida:
        return Dinheiro(0)
    return Dinheiro(max(0, aplicado - soma_dos_pesos))


def posicoes_do_usuario(
    uow: UnidadeDeTrabalho, usuario_id: UUID, hoje: date | None = None
) -> list[PosicaoDeInvestimento]:
    """Igual a ``ListarInvestimentos``, para quem já tem a unidade de trabalho aberta."""
    hoje = hoje or hoje_no_fuso_do_negocio(datetime.now(UTC))
    dados = {e.id_externo: e.dados for e in uow.investimentos.listar(usuario_id)}
    cores = uow.cores_das_destinacoes.listar(usuario_id)
    principais = uow.destinacoes.principais(usuario_id)
    movimentos = uow.movimentos_de_investimento.listar(usuario_id, date.min, date.max)
    partes = uow.destinacoes.do_movimento([m.id for m in movimentos])
    tags_das_destinacoes = {v: k for k, v in uow.alocacoes.ids_das_tags(usuario_id).items()}
    posicoes = []
    for investimento in uow.investimentos.listar_posicoes(usuario_id):
        if investimento.encerrado:
            # Vencido ou resgatado por inteiro: sai da lista e não sobra principal a mostrar
            # (-100%). O histórico de saldos e os movimentos continuam guardados.
            continue
        dele = principais.get(investimento.id, {})
        alocadas = uow.alocacoes.listar_da_posicao(usuario_id, investimento.id)
        pesos = {
            tags_das_destinacoes[a.destinacao_id]: a.peso_centavos
            for a in alocadas
            if a.destinacao_id in tags_das_destinacoes
        }
        sem_caixinha_principal = Dinheiro(0)
        if pesos:
            # Modelo novo: a caixinha é uma fração da posição; a compra nova fica "sem caixinha"
            # até a pessoa alocá-la, e o rendimento acompanha o da posição.
            rateio = ratear_pelos_pesos(
                investimento.saldo,
                pesos,
                valor_sem_caixinha(uow, usuario_id, investimento, sum(pesos.values())),
            )
            principal_de = {tag: Dinheiro(peso) for tag, peso in pesos.items()}
        else:
            sem_caixinha = parte_sem_caixinha_do_rateio(investimento, dele)
            rateio = ratear_saldo(investimento.saldo, dele, sem_caixinha)
            principal_de = dele
            sem_caixinha_principal = sem_caixinha or Dinheiro(0)
        destinacoes = tuple(
            _destinacao(
                tag,
                principal_de.get(tag, Dinheiro(0)) if tag else sem_caixinha_principal,
                valor,
                cores.get(tag),
            )
            for tag, valor in rateio
        )
        aplicado, rendimento, origem = _aplicado_e_rendimento(investimento)
        dele_movimentos = [m for m in movimentos if m.investimento_id == investimento.id]
        custos = [
            m for m in dele_movimentos if m.tipo in (TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO)
        ]
        resgates = [m for m in dele_movimentos if m.tipo == TipoDeMovimento.RESGATE]
        vendas = []
        base_completa = True
        for m in resgates:
            detalhe = [uow.destinacoes.resgate_da_tag(m.id, tag) for tag, _ in partes.get(m.id, [])]
            if not detalhe or sum(p[0].centavos for p in detalhe if p) != m.valor.centavos:
                base_completa = False
            else:
                vendas.append((m.valor, Dinheiro(sum(p[1].centavos for p in detalhe if p))))
        ids_resgates = {m.id for m in resgates}
        resultado = (
            apurar_resultado_realizado(
                vendas,
                Dinheiro(
                    sum(
                        c.valor.centavos
                        for c in custos
                        if c.movimento_relacionado_id in ids_resgates
                    )
                ),
                Dinheiro(
                    sum(
                        m.valor.centavos
                        for m in dele_movimentos
                        if m.tipo == TipoDeMovimento.RENDIMENTO
                    )
                ),
            )
            if base_completa
            and (resgates or any(m.tipo == TipoDeMovimento.RENDIMENTO for m in dele_movimentos))
            else None
        )
        posicoes.append(
            PosicaoDeInvestimento(
                investimento,
                destinacoes,
                rentabilidade_em_percentual(rendimento, aplicado),
                aplicado,
                rendimento,
                origem,
                Dinheiro(sum(c.valor.centavos for c in custos)),
                resultado,
                min(
                    (
                        m.data
                        for m in dele_movimentos
                        if m.tipo == TipoDeMovimento.APORTE and m.origem.value != "saldo_inicial"
                    ),
                    default=None,
                ),
                alocacao_por_fracao=bool(pesos),
                pendencias_de_operacoes=tuple(
                    json.loads(dados.get(investimento.id_externo, "{}")).get(
                        "gastoba_pendencias_de_operacoes", []
                    )
                ),
                **_posicao_pelas_operacoes(
                    uow, usuario_id, investimento, dados.get(investimento.id_externo, "{}"), hoje
                ),
            )
        )
    return posicoes


def principal_e_rendimento_por_tag(
    posicoes: list[PosicaoDeInvestimento],
) -> dict[Tag, tuple[Dinheiro, Dinheiro]]:
    """Por tag, somando os investimentos: (principal, rendimento = valor atual − principal)."""
    totais: dict[Tag, tuple[Dinheiro, Dinheiro]] = {}
    for posicao in posicoes:
        for destinacao in posicao.destinacoes:
            if destinacao.tag is None:
                continue
            principal, rendimento = totais.get(destinacao.tag, (Dinheiro(0), Dinheiro(0)))
            totais[destinacao.tag] = (
                principal + destinacao.principal,
                rendimento + destinacao.rendimento,
            )
    return totais


def _aplicado_e_rendimento(
    investimento: Investimento,
) -> tuple[Dinheiro | None, Dinheiro | None, str | None]:
    """O que a instituição informa; sem isso, nulos. Nenhuma estimativa pelo principal dos
    aportes: nas posições com operações ela foi retirada (T075) e, na conta investimentos
    (``CAIXINHA``), o saldo é o do banco (071)."""
    if investimento.valor_aplicado is not None or investimento.rendimento is not None:
        return investimento.valor_aplicado, investimento.rendimento, "instituicao"
    return None, None, None


def _destinacao(
    tag: Tag | None, principal: Dinheiro, valor_atual: Dinheiro, cor: CorDaDestinacao | None = None
) -> DestinacaoDoInvestimento:
    # A parte "sem destinação" só tem principal quando a instituição informa o valor aplicado (078):
    # aí a tabela fecha com a posição; sem principal ela fica sem rendimento nem rentabilidade.
    com_principal = tag is not None or principal.centavos > 0
    rendimento = valor_atual - principal if com_principal else Dinheiro(0)
    return DestinacaoDoInvestimento(
        tag=tag,
        cor=cor,
        principal=principal,
        valor_atual=valor_atual,
        rendimento=rendimento,
        rentabilidade=rentabilidade_em_percentual(rendimento, principal) if com_principal else None,
    )
