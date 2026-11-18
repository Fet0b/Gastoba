from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import DestinacaoInvalida
from gastoba.domain.tag import Tag


@dataclass(frozen=True, slots=True)
class Destinacao:
    """Parte de um aporte reservada a um propósito, identificada por uma tag."""

    tag: Tag
    percentual: int

    def __post_init__(self) -> None:
        if isinstance(self.percentual, bool) or not 1 <= self.percentual <= 100:
            raise DestinacaoInvalida("O percentual da destinação deve ser um inteiro de 1 a 100.")


@dataclass(frozen=True, slots=True)
class ParteDeDestinacao:
    """Parte gravada de um movimento: a tag, o dinheiro e, no resgate por custo médio, o principal
    abatido (mesmo sinal do dinheiro). Sem ``principal``, o principal é o próprio valor.

    ``categoria`` é a foto da categoria do vínculo da tag na hora do aporte (nula sem vínculo)."""

    tag: Tag
    valor: Dinheiro
    principal: Dinheiro | None = None
    categoria: CategoriaDoGasto | None = None


def validar_destinacoes(destinacoes: Sequence[Destinacao]) -> None:
    """A lista precisa ter ao menos uma destinação, sem tag repetida, somando exatamente 100%."""
    if not destinacoes:
        raise DestinacaoInvalida("Informe ao menos uma destinação.")
    if len({d.tag for d in destinacoes}) != len(destinacoes):
        raise DestinacaoInvalida("Cada tag só pode aparecer uma vez nas destinações.")
    if sum(d.percentual for d in destinacoes) != 100:
        raise DestinacaoInvalida("Os percentuais das destinações devem somar 100%.")


def repartir(total: int, pesos: Sequence[int], soma_dos_pesos: int) -> list[int]:
    """``total`` proporcional aos pesos, em inteiros; o resto vai de 1 em 1 para os primeiros."""
    partes = [total * peso // soma_dos_pesos for peso in pesos]
    resto = total - sum(partes)
    for posicao in range(resto):
        partes[posicao] += 1
    return partes


def dividir_por_percentuais(
    valor: Dinheiro, destinacoes: Sequence[Destinacao]
) -> list[tuple[Tag, Dinheiro]]:
    """Divide o valor entre as destinações em centavos inteiros; a soma é sempre ``valor``.

    O resto da divisão vai de 1 em 1 centavo, começando pela primeira destinação (a mesma regra
    de ``dividir_entre_tags``).
    """
    validar_destinacoes(destinacoes)
    partes = repartir(valor.centavos, [d.percentual for d in destinacoes], 100)
    return [(d.tag, Dinheiro(parte)) for d, parte in zip(destinacoes, partes, strict=True)]


def ratear_saldo(
    saldo: Dinheiro, principais: Mapping[Tag, Dinheiro]
) -> list[tuple[Tag | None, Dinheiro]]:
    """Rateia o saldo atual do investimento proporcionalmente ao principal de cada destinação.

    O rendimento fica distribuído na mesma proporção do principal. Sem principal, todo o saldo é
    "sem destinação" (``None``). Ordem: maior principal primeiro e, no empate, a tag crescente;
    o resto vai para as primeiras. A soma das fatias é sempre ``saldo``.
    """
    com_principal = sorted(
        ((tag, p) for tag, p in principais.items() if p.centavos > 0),
        key=lambda item: (-item[1].centavos, item[0].valor),
    )
    if not com_principal:
        return [(None, saldo)] if saldo.centavos > 0 else []
    soma = sum(p.centavos for _, p in com_principal)
    partes = repartir(saldo.centavos, [p.centavos for _, p in com_principal], soma)
    return [(tag, Dinheiro(parte)) for (tag, _), parte in zip(com_principal, partes, strict=True)]


def principal_abatido(
    principal: Dinheiro, parte_em_dinheiro: Dinheiro, valor_da_tag: Dinheiro
) -> Dinheiro:
    """Parte do principal que sai num resgate, proporcional à fração do valor da tag resgatada.

    Resgate de ``parte_em_dinheiro`` sobre um ``valor_da_tag`` (principal mais rendimento): abate
    ``principal * parte // valor_da_tag`` em centavos inteiros (truncado). Resgate total (parte
    igual ou maior que o valor) abate o principal inteiro. Validar "parte maior que o valor" é do
    chamador.
    """
    if valor_da_tag.centavos <= 0:
        raise DestinacaoInvalida("A destinação não tem valor para resgatar.")
    if parte_em_dinheiro.centavos >= valor_da_tag.centavos:
        return principal
    return Dinheiro(principal.centavos * parte_em_dinheiro.centavos // valor_da_tag.centavos)


def abater_das_partes(
    partes: Sequence[tuple[Tag, Dinheiro]], abatimento: Dinheiro
) -> list[tuple[Tag, Dinheiro]]:
    """As partes que sobram depois de tirar ``abatimento`` delas, na proporção de cada uma.

    Em centavos inteiros, com o resto de 1 em 1 centavo para as primeiras (como ``repartir``).
    Abatimento igual ou maior que o total não deixa nada; parte que zera é omitida.
    """
    total = sum(valor.centavos for _, valor in partes)
    restante = total - abatimento.centavos
    if restante <= 0:
        return []
    novas = repartir(restante, [valor.centavos for _, valor in partes], total)
    return [(tag, Dinheiro(valor)) for (tag, _), valor in zip(partes, novas, strict=True) if valor]


def destinacoes_proporcionais(principais: Mapping[Tag, Dinheiro]) -> list[Destinacao]:
    """Destinações que reproduzem a divisão do principal entre as tags, em percentuais inteiros
    que somam 100 (o resto vai de 1 em 1 para as maiores). Tag que arredonda para 0% sai.

    Vazio se não há principal. Serve para o resgate herdar as destinações da posição.
    """
    com_principal = sorted(
        ((tag, p) for tag, p in principais.items() if p.centavos > 0),
        key=lambda item: (-item[1].centavos, item[0].valor),
    )
    if not com_principal:
        return []
    soma = sum(p.centavos for _, p in com_principal)
    percentuais = repartir(100, [p.centavos for _, p in com_principal], soma)
    return [
        Destinacao(tag, percentual)
        for (tag, _), percentual in zip(com_principal, percentuais, strict=True)
        if percentual > 0
    ]
