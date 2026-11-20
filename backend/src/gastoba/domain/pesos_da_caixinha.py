from collections.abc import Mapping

from gastoba.domain.destinacao import ratear_saldo
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.tag import Tag


def pesos_da_caixinha(principais: Mapping[Tag, Dinheiro]) -> dict[Tag, int]:
    """Converte os principais por tag (congelados na migração) em pesos de alocação, em
    centavos. Tag sem principal positivo não tem peso."""
    return {tag: p.centavos for tag, p in principais.items() if p.centavos > 0}


def ratear_pelos_pesos(
    saldo: Dinheiro, pesos: Mapping[Tag, int], sem_caixinha: Dinheiro
) -> list[tuple[Tag | None, Dinheiro]]:
    """Valor de cada caixinha pelos pesos; a parte ``sem_caixinha`` (compra nova ainda não
    alocada) fica fora do rateio e aparece como ``None``.

    Com ``sem_caixinha`` zero, o resultado é exatamente o de ``ratear_saldo`` sobre os principais
    (0 centavo de diferença). A parte sem caixinha nunca passa do saldo.
    """
    fora = Dinheiro(min(max(sem_caixinha.centavos, 0), max(saldo.centavos, 0)))
    dentro = Dinheiro(saldo.centavos - fora.centavos)
    rateio = ratear_saldo(dentro, {tag: Dinheiro(peso) for tag, peso in pesos.items()})
    if fora.centavos == 0:
        return rateio
    sem_destino = [(t, v) for t, v in rateio if t is None]
    com_destino = [(t, v) for t, v in rateio if t is not None]
    total_sem = Dinheiro(sum(v.centavos for _, v in sem_destino) + fora.centavos)
    return [*com_destino, (None, total_sem)]
