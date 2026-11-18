from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import OperacaoInvalida
from gastoba.domain.operacao import Operacao, TipoDeOperacao

_ENTRADAS = (TipoDeOperacao.COMPRA, TipoDeOperacao.ABERTURA)
_SAIDAS = (TipoDeOperacao.VENDA, TipoDeOperacao.VENCIMENTO)


def _centavos(valor: Fraction) -> int:
    """Arredonda metade para cima, só no fim do cálculo (nunca por operação)."""
    return int((valor * 2 + 1) // 2) if valor >= 0 else -int((-valor * 2 + 1) // 2)


@dataclass(frozen=True, slots=True)
class PosicaoCalculada:
    quantidade: Decimal
    valor_aplicado: Dinheiro
    resultado_realizado: Dinheiro
    proventos: Dinheiro
    custo_total: Fraction

    @property
    def custo_medio(self) -> Decimal | None:
        """Custo por unidade, em reais, com três casas; ``None`` sem quantidade."""
        if self.quantidade == 0:
            return None
        por_unidade = self.custo_total / Fraction(self.quantidade) / 100
        return Decimal(por_unidade.numerator) / Decimal(por_unidade.denominator)

    def resultado_nao_realizado(self, valor_de_mercado: Dinheiro) -> Dinheiro:
        return valor_de_mercado - self.valor_aplicado


def calcular_posicao(operacoes: Iterable[Operacao]) -> PosicaoCalculada:
    """Custo médio ponderado, com custos somados à compra (IN RFB 1.585/2015, art. 58).

    Venda e vencimento abatem pelo custo médio vigente; o resultado realizado é a receita
    líquida menos o custo baixado. Provento não muda quantidade nem custo.
    """
    quantidade = Decimal(0)
    custo_total = Fraction(0)
    realizado = Fraction(0)
    proventos = 0
    for operacao in sorted(operacoes, key=lambda o: o.data):
        if operacao.tipo in _ENTRADAS:
            quantidade += operacao.quantidade
            custo_total += operacao.valor_bruto.centavos + operacao.custos.centavos
        elif operacao.tipo in _SAIDAS:
            if operacao.quantidade > quantidade:
                raise OperacaoInvalida("A venda é maior que a quantidade da posição.")
            if quantidade == 0:
                continue
            baixado = custo_total * Fraction(operacao.quantidade) / Fraction(quantidade)
            realizado += operacao.valor_bruto.centavos - operacao.custos.centavos - baixado
            custo_total -= baixado
            quantidade -= operacao.quantidade
        elif operacao.tipo == TipoDeOperacao.PROVENTO:
            proventos += operacao.valor_bruto.centavos
    if quantidade == 0:
        custo_total = Fraction(0)
    return PosicaoCalculada(
        quantidade=quantidade,
        valor_aplicado=Dinheiro(_centavos(custo_total)),
        resultado_realizado=Dinheiro(_centavos(realizado)),
        proventos=Dinheiro(proventos),
        custo_total=custo_total,
    )


def custo_de_fonte_unica(
    custos_da_operacao: Dinheiro, debitos_de_taxa_casados: Dinheiro
) -> Dinheiro:
    """O custo de uma operação vem de **uma só fonte** (D12): as despesas (`expenses`) da própria
    operação da corretora; se vierem vazias, a soma dos débitos de taxa casados. Nunca as duas
    somadas, porque as mesmas taxas chegam pelos dois caminhos."""
    if custos_da_operacao.centavos > 0:
        return custos_da_operacao
    return debitos_de_taxa_casados
