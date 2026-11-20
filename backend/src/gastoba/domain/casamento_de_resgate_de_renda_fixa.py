from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations

from gastoba.domain.casamento_de_liquidacao import Tolerancia
from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.operacao import Operacao, TipoDeOperacao
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

TIPOS_DE_RESGATE = (TipoDeOperacao.VENDA, TipoDeOperacao.VENCIMENTO)
MAXIMO_DE_CREDITOS = 3


@dataclass(frozen=True, slots=True)
class SugestaoDeCasamentoDeRendaFixa:
    operacao: Operacao
    creditos: tuple[TransacaoImportada, ...]
    debito_do_imposto: TransacaoImportada | None


def _na_janela(transacao: TransacaoImportada, operacao: Operacao, tolerancia: Tolerancia) -> bool:
    return abs((transacao.data - operacao.data).days) <= tolerancia.dias


def e_imposto(transacao: TransacaoImportada) -> bool:
    return (
        transacao.sentido == SentidoDaTransacao.SAIDA
        and natureza_da_descricao(transacao.descricao) == NaturezaDoMovimento.IMPOSTO_OU_TAXA
    )


def debito_do_imposto(
    operacao: Operacao,
    conta_id,
    transacoes: Sequence[TransacaoImportada],
    tolerancia: Tolerancia,
) -> TransacaoImportada | None:
    if operacao.custos.centavos <= 0:
        return None
    iguais = [
        t
        for t in transacoes
        if e_imposto(t)
        and t.conta_id == conta_id
        and _na_janela(t, operacao, tolerancia)
        and abs(t.valor.centavos - operacao.custos.centavos) <= tolerancia.centavos
    ]
    return iguais[0] if len(iguais) == 1 else None


def combinacoes_do_bruto(
    operacao: Operacao, entradas: Sequence[TransacaoImportada], tolerancia: Tolerancia
) -> list[tuple[TransacaoImportada, ...]]:
    achadas = []
    for tamanho in range(1, MAXIMO_DE_CREDITOS + 1):
        for grupo in combinations(entradas, tamanho):
            soma = sum(t.valor.centavos for t in grupo)
            if abs(soma - operacao.valor_bruto.centavos) <= tolerancia.centavos:
                achadas.append(grupo)
    return achadas


def sugerir_casamentos_de_renda_fixa(
    operacoes: Sequence[Operacao],
    transacoes: Sequence[TransacaoImportada],
    tolerancia: Tolerancia,
) -> list[SugestaoDeCasamentoDeRendaFixa]:
    """Sugere casar o resgate de renda fixa pelo **bruto**: a conta recebe o bruto em uma ou mais
    entradas (ex.: principal e rendimento) e o IRRF chega num débito separado, igual ao
    ``incomeTax`` da operação. Nunca casa pelo líquido. Só sugere com exatamente uma combinação;
    entrada que serve a mais de uma operação não casa com nenhuma.
    """
    achados: dict[int, list[tuple[TransacaoImportada, ...]]] = {}
    for indice, operacao in enumerate(operacoes):
        if operacao.tipo not in TIPOS_DE_RESGATE:
            continue
        combinacoes: list[tuple[TransacaoImportada, ...]] = []
        for conta_id in {t.conta_id for t in transacoes}:
            entradas = [
                t
                for t in transacoes
                if t.sentido == SentidoDaTransacao.ENTRADA
                and t.conta_id == conta_id
                and _na_janela(t, operacao, tolerancia)
                and not t.descricao.upper().startswith("LIQ BOLSA")
            ]
            combinacoes += combinacoes_do_bruto(operacao, entradas, tolerancia)
        achados[indice] = combinacoes
    usos: dict[int, int] = {}
    for combinacoes in achados.values():
        if len(combinacoes) == 1:
            for t in combinacoes[0]:
                usos[id(t)] = usos.get(id(t), 0) + 1
    sugestoes = []
    for indice, combinacoes in achados.items():
        if len(combinacoes) != 1 or any(usos[id(t)] > 1 for t in combinacoes[0]):
            continue
        creditos = combinacoes[0]
        imposto = debito_do_imposto(operacoes[indice], creditos[0].conta_id, transacoes, tolerancia)
        sugestoes.append(SugestaoDeCasamentoDeRendaFixa(operacoes[indice], creditos, imposto))
    return sugestoes


def montar_casamento_de_renda_fixa(
    operacao: Operacao,
    creditos: Sequence[TransacaoImportada],
    debito_do_imposto: TransacaoImportada | None,
    tolerancia: Tolerancia,
) -> CasamentoDeOperacao:
    """Valida e monta o casamento escolhido pela pessoa. A soma dos créditos e o débito do
    imposto são regras do domínio (o banco só garante papel válido e uso único da transação)."""
    if operacao.tipo not in TIPOS_DE_RESGATE:
        raise OperacaoInvalida("Só resgate ou vencimento de renda fixa casa pelo bruto.")
    if not creditos or any(c.sentido != SentidoDaTransacao.ENTRADA for c in creditos):
        raise OperacaoInvalida("O resgate casa com as entradas que somam o valor bruto.")
    soma = sum(c.valor.centavos for c in creditos)
    if abs(soma - operacao.valor_bruto.centavos) > tolerancia.centavos:
        raise OperacaoInvalida("As entradas escolhidas não somam o valor bruto do resgate.")
    vinculos = [VinculoDeCasamento(c.id, PapelDoVinculo.BRUTO) for c in creditos]
    if debito_do_imposto is not None:
        if (
            not e_imposto(debito_do_imposto)
            or abs(debito_do_imposto.valor.centavos - operacao.custos.centavos)
            > tolerancia.centavos
        ):
            raise OperacaoInvalida("O débito de imposto não é igual ao imposto do resgate.")
        vinculos.append(VinculoDeCasamento(debito_do_imposto.id, PapelDoVinculo.IMPOSTO))
    return CasamentoDeOperacao((operacao.id,), tuple(vinculos))
