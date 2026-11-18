from collections.abc import Sequence
from uuid import UUID

from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import PrincipalInsuficiente
from gastoba.domain.movimento_de_investimento import MovimentoDeInvestimento, TipoDeMovimento
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


def conferir_principal_disponivel(
    uow: UnidadeDeTrabalho, usuario_id: UUID, movimentos: Sequence[MovimentoDeInvestimento]
) -> None:
    aportes = [
        m
        for m in movimentos
        if m.tipo in (TipoDeMovimento.APORTE, TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO)
        and m.investimento_id is not None
    ]
    partes = uow.destinacoes.do_movimento([m.id for m in aportes])
    necessarios: dict[tuple[UUID, Tag], int] = {}
    for movimento in aportes:
        assert movimento.investimento_id is not None
        for tag, valor in partes.get(movimento.id, []):
            chave = (movimento.investimento_id, tag)
            necessarios[chave] = necessarios.get(chave, 0) + valor.centavos
    principais = uow.destinacoes.principais(usuario_id)
    for (investimento_id, tag), centavos in necessarios.items():
        if principais.get(investimento_id, {}).get(tag, Dinheiro(0)).centavos < centavos:
            raise PrincipalInsuficiente(
                f"Não dá para desfazer: a destinação «{tag}» já não tem esse valor "
                "(uma realocação ou um resgate o usou)."
            )
