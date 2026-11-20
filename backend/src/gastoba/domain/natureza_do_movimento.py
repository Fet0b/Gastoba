import re
import unicodedata
from enum import StrEnum

from gastoba.domain.excecoes import MovimentoIncompativelComInvestimento, TransacaoImportadaInvalida
from gastoba.domain.movimento_de_investimento import TipoDeMovimento
from gastoba.domain.texto import normalizar_texto


def texto_normalizado(descricao: str) -> str:
    texto = "".join(
        c for c in unicodedata.normalize("NFKD", descricao.lower()) if not unicodedata.combining(c)
    )
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def e_conta_remunerada(descricao: str) -> bool:
    texto = texto_normalizado(descricao)
    return "conta remunerada" in texto or bool(
        re.search(r"\b(aplicacao|resgate) automatic[oa]\b", texto)
    )


def tipo_sugerido(descricao: str) -> TipoDeMovimento | None:
    texto = texto_normalizado(descricao)
    if re.search(r"\b(irrf|iof)\b", texto):
        return TipoDeMovimento.IMPOSTO
    if re.search(r"\btx\b.*\b(ccp|emol|tta|b3)\b", texto):
        return TipoDeMovimento.CUSTO
    if re.search(r"\brendimento|\bremuneracao", texto):
        return TipoDeMovimento.RENDIMENTO
    return None


def exigir_lancamento_comum(descricao: str, conta_e_de_investimentos: bool) -> None:
    """Recusa, como gasto ou ganho comum, o que pertence ao investimento.

    IOF e IRRF só são imposto de investimento na conta investimentos: em conta corrente ou cartão
    (o IOF de uma compra no exterior) são gasto como outro qualquer, e a sugestão "Imposto"
    (``tipo_sugerido``) continua valendo nas duas. As demais recusas valem em qualquer conta.
    """
    sugerido = tipo_sugerido(descricao)
    imposto_de_gasto = sugerido == TipoDeMovimento.IMPOSTO and not conta_e_de_investimentos
    if e_conta_remunerada(descricao) or (sugerido is not None and not imposto_de_gasto):
        raise TransacaoImportadaInvalida(
            "Esta operação pertence ao investimento; escolha a natureza do movimento ou ignore."
        )
    if natureza_da_descricao(descricao) == NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA:
        raise TransacaoImportadaInvalida(
            "A liquidação da bolsa não é gasto nem ganho: ligue-a às operações na Revisão da "
            "bolsa, ou classifique como investimento ou ignore."
        )


def validar_tipo_de_movimento(descricao: str, tipo: TipoDeMovimento, entrada: bool) -> None:
    sugerido = tipo_sugerido(descricao)
    if sugerido is not None and sugerido != tipo:
        raise TransacaoImportadaInvalida(
            "Confira a natureza: este movimento é rendimento, custo ou imposto, não aporte/resgate."
        )
    if entrada != (tipo in (TipoDeMovimento.RESGATE, TipoDeMovimento.RENDIMENTO)):
        raise TransacaoImportadaInvalida(
            "O tipo escolhido não corresponde ao sentido do movimento."
        )


class NaturezaDoMovimento(StrEnum):
    """O que a descrição do banco diz que o movimento é, quando diz."""

    # Aplicação e resgate automáticos do saldo da conta: o dinheiro continua na conta do banco.
    CONTA_REMUNERADA = "conta_remunerada"
    # Imposto (IRRF, IOF) e custos de corretagem e B3: nunca é dinheiro novo investido.
    IMPOSTO_OU_TAXA = "imposto_ou_taxa"
    # Liquidação de compra ou venda na bolsa (sem o ticker na descrição).
    LIQUIDACAO_DE_BOLSA = "liquidacao_de_bolsa"
    # Vencimento de título de renda fixa.
    VENCIMENTO = "vencimento"
    # Rendimento da conta remunerada: acrescenta ao saldo da caixinha, não é renda nem gasto.
    RENDIMENTO = "rendimento"
    OUTRA = "outra"


_IMPOSTO = re.compile(r"\b(irrf|iof)\b|\btx (emol|ccp|tta)\b")
_RENDIMENTO = re.compile(r"\brendimentos?\b|\bremuneracao\b")
_CONTA_REMUNERADA = re.compile(r"\bconta remunerada\b|\b(aplicacao|resgate) automatic[oa]\b")


def natureza_da_descricao(descricao: str) -> NaturezaDoMovimento:
    """Classifica pela descrição. Imposto e taxa têm prioridade: ``LIQ BOLSA - VISTA TX EMOL`` é
    custo, não liquidação."""
    texto = normalizar_texto(descricao)
    if _IMPOSTO.search(texto):
        return NaturezaDoMovimento.IMPOSTO_OU_TAXA
    if _RENDIMENTO.search(texto):
        return NaturezaDoMovimento.RENDIMENTO
    if _CONTA_REMUNERADA.search(texto):
        return NaturezaDoMovimento.CONTA_REMUNERADA
    if texto.startswith("liq bolsa"):
        return NaturezaDoMovimento.LIQUIDACAO_DE_BOLSA
    if texto.startswith("vencimento"):
        return NaturezaDoMovimento.VENCIMENTO
    return NaturezaDoMovimento.OUTRA


TIPO_DA_CAIXINHA = "CAIXINHA"


def exigir_aporte_valido(descricao: str, com_investimento: bool) -> None:
    """Imposto e taxa compõem o custo da posição a que pertencem: só viram aporte ligados a ela.
    Sem posição, não são dinheiro investido (lance como gasto ou ignore)."""
    if (
        natureza_da_descricao(descricao) == NaturezaDoMovimento.IMPOSTO_OU_TAXA
        and not com_investimento
    ):
        raise MovimentoIncompativelComInvestimento(
            "Imposto e taxa só entram como custo de uma posição: escolha o investimento, "
            "lance como gasto ou ignore."
        )


def exigir_ligacao_valida(descricao: str, tipo_do_investimento: str) -> None:
    """A aplicação e o resgate automáticos da conta remunerada ficam no saldo da conta do banco:
    só podem ser ligados à caixinha (investimento sintético da conta), nunca a uma ação ou título
    da Pluggy."""
    if (
        natureza_da_descricao(descricao) == NaturezaDoMovimento.CONTA_REMUNERADA
        and tipo_do_investimento != TIPO_DA_CAIXINHA
    ):
        raise MovimentoIncompativelComInvestimento(
            "Movimento da conta investimentos só pode ser ligado à caixinha da conta."
        )
