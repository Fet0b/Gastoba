import re
from collections.abc import Sequence
from uuid import UUID

from gastoba.domain.investimento import Investimento

_SIGLAS = {
    "BTG",
    "CDB",
    "LCI",
    "LCA",
    "CDI",
    "XP",
    "BB",
    "CEF",
    "FGC",
    "IPCA",
    "SELIC",
    "ETF",
    "FII",
}


def normalizar_nome(nome: str) -> str:
    """Nome para exibir: sem caixa alta crua e sem sufixos como "S.A." (nunca muda o persistido)."""
    if re.search(r"[a-zà-öø-ÿ]", nome):
        return nome
    limpo = re.sub(r"\bS\s*\.\s*A\s*\.?$|\bS/A\b|\bLTDA\.?$", "", nome)
    limpo = re.sub(r"\bBANCO\s+(?=\S)", "", limpo)
    limpo = re.sub(r"\s+-\s+", " ", limpo)
    limpo = re.sub(r"\s+", " ", limpo).strip() or nome
    palavras = []
    for palavra in limpo.split(" "):
        if palavra in _SIGLAS or re.fullmatch(r"[A-Z]{4}\d{1,2}", palavra):
            palavras.append(palavra)
        else:
            palavras.append(palavra[:1] + palavra[1:].lower())
    return " ".join(palavras)


def _taxa(investimento: Investimento) -> str | None:
    taxa = investimento.taxa
    if taxa is None or taxa.percentual is None:
        return None
    numero = format(taxa.percentual.normalize(), "f").replace(".", ",")
    texto = f"{numero}% {taxa.indexador}" if taxa.indexador else f"{numero}% a.a."
    if taxa.adicional_anual:
        texto += f" + {format(taxa.adicional_anual.normalize(), 'f').replace('.', ',')}% a.a."
    return texto


def rotulos_dos_investimentos(investimentos: Sequence[Investimento]) -> dict[UUID, str]:
    """Um rótulo por investimento, com o que o distingue (vencimento e taxa) e, se ainda houver
    repetição, o final do identificador, em quantidade mínima de caracteres. Dois investimentos
    distintos nunca têm o mesmo rótulo (Art. XI.5.6); a ordem da lista não muda o resultado."""
    base: dict[UUID, str] = {}
    for i in investimentos:
        partes = [normalizar_nome(i.nome)]
        if i.vencimento is not None:
            partes.append(f"vence {i.vencimento.month:02d}/{i.vencimento.year}")
        taxa = _taxa(i)
        if taxa:
            partes.append(taxa)
        base[i.id] = ", ".join(partes)
    resultado = dict(base)
    por_texto: dict[str, list[Investimento]] = {}
    for i in investimentos:
        por_texto.setdefault(base[i.id], []).append(i)
    for grupo in por_texto.values():
        if len(grupo) == 1:
            continue
        for tamanho in range(4, 33):
            finais = {i.id: i.id.hex[-tamanho:] for i in grupo}
            if len(set(finais.values())) == len(grupo):
                break
        for i in grupo:
            resultado[i.id] = f"{base[i.id]}, final {finais[i.id]}"
    return resultado
