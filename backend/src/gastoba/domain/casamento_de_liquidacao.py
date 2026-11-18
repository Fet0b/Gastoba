import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from gastoba.domain.casamento_de_operacao import (
    CasamentoDeOperacao,
    PapelDoVinculo,
    VinculoDeCasamento,
)
from gastoba.domain.excecoes import CasamentoAmbiguo, OperacaoInvalida
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.operacao import Operacao, TipoDeOperacao
from gastoba.domain.texto import normalizar_texto
from gastoba.domain.transacao_importada import SentidoDaTransacao, TransacaoImportada

_PREGAO = re.compile(r"PREG[ÃA]O:?\s*(\d{2})/(\d{2})/(\d{4})", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class Tolerancia:
    """Padrão do dono (D4): valor exato e data do pregão até D+2, ambos configuráveis."""

    dias: int = 2
    centavos: int = 0


@dataclass(frozen=True, slots=True)
class SugestaoDeCasamentoDeBolsa:
    operacao: Operacao
    bruto: TransacaoImportada
    taxas: tuple[TransacaoImportada, ...]


def data_do_pregao(descricao: str) -> date | None:
    """A data do pregão escrita na liquidação (``PREGÃO: dd/mm/aaaa``); ``None`` se não há."""
    achado = _PREGAO.search(descricao)
    if achado is None:
        return None
    dia, mes, ano = (int(g) for g in achado.groups())
    try:
        return date(ano, mes, dia)
    except ValueError:
        return None


def e_liquidacao_bruta(descricao: str) -> bool:
    texto = normalizar_texto(descricao)
    return texto.startswith("liq bolsa") and bool(re.search(r"\bbruto\b", texto))


def e_taxa_de_liquidacao(descricao: str) -> bool:
    texto = normalizar_texto(descricao)
    return (
        natureza_da_descricao(descricao) == NaturezaDoMovimento.IMPOSTO_OU_TAXA
        and texto.startswith("liq bolsa")
        and bool(re.search(r"\btx\b", texto))
    )


_SENTIDO_DA_OPERACAO = {
    TipoDeOperacao.COMPRA: SentidoDaTransacao.SAIDA,
    TipoDeOperacao.VENDA: SentidoDaTransacao.ENTRADA,
}


def sugerir_casamentos_de_bolsa(
    operacoes: Sequence[Operacao],
    transacoes: Sequence[TransacaoImportada],
    tolerancia: Tolerancia,
) -> list[SugestaoDeCasamentoDeBolsa]:
    """Sugere casar o débito (ou crédito) bruto da liquidação com a compra (ou venda) da corretora.

    Só sugere com **exatamente um** candidato; zero ou vários não casam sozinhos, e um mesmo
    bruto que serve a mais de uma operação não casa com nenhuma. As taxas (``TX CCP/EMOL/TTA``) do
    mesmo dia e da mesma conta acompanham o bruto, sem somar ao custo quando a corretora já informa
    as despesas (D12).
    """
    brutos = [t for t in transacoes if e_liquidacao_bruta(t.descricao)]
    candidatos: dict[int, list[TransacaoImportada]] = {}
    for indice, operacao in enumerate(operacoes):
        sentido = _SENTIDO_DA_OPERACAO.get(operacao.tipo)
        if sentido is None:
            continue
        candidatos[indice] = [
            b
            for b in brutos
            if b.sentido == sentido
            and abs(b.valor.centavos - operacao.valor_bruto.centavos) <= tolerancia.centavos
            and (pregao := data_do_pregao(b.descricao)) is not None
            and abs((pregao - operacao.data).days) <= tolerancia.dias
        ]
    usos: dict[int, int] = {}
    for lista in candidatos.values():
        for b in lista:
            usos[id(b)] = usos.get(id(b), 0) + 1
    sugestoes = []
    for indice, lista in candidatos.items():
        if len(lista) != 1 or usos[id(lista[0])] != 1:
            continue
        bruto = lista[0]
        taxas = tuple(
            t
            for t in transacoes
            if e_taxa_de_liquidacao(t.descricao)
            and t.conta_id == bruto.conta_id
            and t.data == bruto.data
        )
        sugestoes.append(SugestaoDeCasamentoDeBolsa(operacoes[indice], bruto, taxas))
    return sugestoes


def montar_casamento_de_bolsa(
    operacoes: Sequence[Operacao], transacoes: Sequence[TransacaoImportada], tolerancia: Tolerancia
) -> CasamentoDeOperacao:
    """Valida e monta o casamento escolhido: exatamente um bruto que serve à soma das operações
    (todas do mesmo dia e do mesmo sentido) e as demais transações como taxas da liquidação."""
    if not operacoes:
        raise OperacaoInvalida("Escolha ao menos uma operação.")
    tipos = {o.tipo for o in operacoes}
    if len(tipos) != 1 or next(iter(tipos)) not in _SENTIDO_DA_OPERACAO:
        raise OperacaoInvalida("Só compras, ou só vendas, casam com a liquidação da bolsa.")
    if len({o.data for o in operacoes}) != 1:
        raise OperacaoInvalida("As operações de uma liquidação precisam ser do mesmo dia.")
    sentido = _SENTIDO_DA_OPERACAO[next(iter(tipos))]
    total = sum(o.valor_bruto.centavos for o in operacoes)
    brutos = [
        t
        for t in transacoes
        if e_liquidacao_bruta(t.descricao)
        and t.sentido == sentido
        and abs(t.valor.centavos - total) <= tolerancia.centavos
    ]
    if not brutos:
        raise OperacaoInvalida("Nenhuma das transações é a liquidação bruta destas operações.")
    if len(brutos) > 1:
        raise CasamentoAmbiguo("Há mais de uma liquidação bruta possível para estas operações.")
    bruto = brutos[0]
    taxas = [t for t in transacoes if t is not bruto]
    if not all(e_taxa_de_liquidacao(t.descricao) for t in taxas):
        raise OperacaoInvalida("As demais transações precisam ser taxas da liquidação.")
    return CasamentoDeOperacao(
        tuple(o.id for o in operacoes),
        (
            VinculoDeCasamento(bruto.id, PapelDoVinculo.BRUTO),
            *(VinculoDeCasamento(t.id, PapelDoVinculo.TAXA) for t in taxas),
        ),
    )
