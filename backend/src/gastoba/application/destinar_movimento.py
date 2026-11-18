from collections.abc import Sequence
from datetime import date
from uuid import UUID

from gastoba.application.abatimentos_do_saldo_inicial import (
    fotografar_saldos_iniciais,
    registrar_abatimentos,
)
from gastoba.domain.destinacao import (
    Destinacao,
    ParteDeDestinacao,
    abater_das_partes,
    dividir_por_percentuais,
    principal_abatido,
    ratear_saldo,
    repartir,
)
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    InvestimentoNaoEncontrado,
    PrincipalInsuficiente,
    ResgateMaiorQueOValorDaDestinacao,
    TransacaoImportadaInvalida,
)
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.natureza_do_movimento import exigir_ligacao_valida
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.tag import Tag


def _partes_do_resgate(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    movimento: MovimentoDeInvestimento,
    investimento_id: UUID,
    divisao: Sequence[tuple[Tag, Dinheiro]],
) -> list[ParteDeDestinacao]:
    """Partes do resgate (com sinal), abatendo o principal por custo médio quando há referência.

    A referência é o último saldo do histórico anterior à data do resgate, rateado entre as tags
    pelos principais atuais. Sem ela (sem ponto anterior, saldo zero ou tag sem valor), o dinheiro
    resgatado é abatido do principal e não pode passar dele.
    """
    principais = uow.destinacoes.principais(usuario_id).get(investimento_id, {})
    saldo_antes = uow.investimentos.saldo_antes_de(usuario_id, investimento_id, movimento.data)
    valores = (
        {tag: valor for tag, valor in ratear_saldo(saldo_antes, principais) if tag is not None}
        if saldo_antes is not None and saldo_antes.centavos > 0
        else {}
    )
    partes = []
    for tag, valor in divisao:
        if not valor.centavos:
            continue
        principal = principais.get(tag, Dinheiro(0))
        valor_da_tag = valores.get(tag)
        abatido = None
        if valor_da_tag is not None and valor_da_tag.centavos > 0:
            if valor.centavos > valor_da_tag.centavos:
                raise ResgateMaiorQueOValorDaDestinacao(
                    f"O resgate passa do valor da destinação «{tag}» antes dele."
                )
            # Ao menos 1 centavo: a coluna do principal abatido não guarda zero.
            abatido = Dinheiro(-max(principal_abatido(principal, valor, valor_da_tag).centavos, 1))
        elif valor.centavos > principal.centavos:
            raise PrincipalInsuficiente(f"O resgate passa do principal da destinação «{tag}».")
        partes.append(ParteDeDestinacao(tag, Dinheiro(-valor.centavos), abatido))
    return partes


def abater_saldos_iniciais(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    investimento_id: UUID,
    quantia: Dinheiro,
    a_partir_de: date | None = None,
) -> Dinheiro:
    """Tira até ``quantia`` dos saldos iniciais do investimento e devolve quanto tirou.

    O abatimento é proporcional às destinações de cada saldo inicial; o que zera deixa de existir.
    Com ``a_partir_de``, só os saldos iniciais criados nesse dia ou depois entram (a foto de um
    saldo inicial mais antigo que o aporte não o contém).
    """
    restante = quantia.centavos
    for inicial in uow.movimentos_de_investimento.saldos_iniciais_do_investimento(
        usuario_id, investimento_id
    ):
        if restante <= 0:
            break
        if a_partir_de is not None and inicial.data < a_partir_de:
            continue
        tirar = min(restante, inicial.valor.centavos)
        partes = uow.destinacoes.do_movimento([inicial.id]).get(inicial.id, [])
        sobra = abater_das_partes(partes, Dinheiro(tirar))
        uow.movimentos_de_investimento.excluir(inicial.id)
        if sobra:
            novo = MovimentoDeInvestimento.de_saldo_inicial(
                investimento_id, Dinheiro(inicial.valor.centavos - tirar), inicial.data
            )
            novo.id = inicial.id
            uow.movimentos_de_investimento.adicionar(novo)
            uow.destinacoes.adicionar(novo.id, [ParteDeDestinacao(t, v) for t, v in sobra])
        restante -= tirar
    return Dinheiro(quantia.centavos - restante)


def _abater_saldo_inicial_duplicado(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    movimento: MovimentoDeInvestimento,
    investimento_id: UUID,
) -> None:
    """Tira do saldo inicial o que o aporte real já explica, para a compra não contar em dobro.

    O saldo inicial é a foto da posição no dia em que foi criado: um aporte real com data até esse
    dia já está dentro dela. Aporte depois do dia é dinheiro novo e não mexe no saldo inicial.
    """
    if (
        movimento.tipo == TipoDeMovimento.APORTE
        and movimento.origem == OrigemDoMovimento.OPEN_FINANCE
    ):
        antes = fotografar_saldos_iniciais(uow, usuario_id, investimento_id)
        abater_saldos_iniciais(
            uow, usuario_id, investimento_id, movimento.valor, a_partir_de=movimento.data
        )
        depois = fotografar_saldos_iniciais(uow, usuario_id, investimento_id)
        registrar_abatimentos(uow, usuario_id, movimento, antes, depois)


def preparar_destinacoes(
    uow: UnidadeDeTrabalho,
    usuario_id: UUID,
    movimento: MovimentoDeInvestimento,
    investimento_id: UUID,
    destinacoes: Sequence[Destinacao],
) -> list[ParteDeDestinacao]:
    """Valida e calcula as partes do movimento (com sinal: negativo no resgate).

    Associa o movimento ao investimento, que precisa ser do usuário. No resgate, cada parte leva
    o principal abatido por custo médio (ver ``_partes_do_resgate``). Quem chama grava as partes
    depois de gravar o movimento.
    """
    investimento = uow.investimentos.obter(usuario_id, investimento_id)
    if investimento is None:
        raise InvestimentoNaoEncontrado("Investimento não encontrado.")
    if movimento.origem == OrigemDoMovimento.OPEN_FINANCE:
        exigir_ligacao_valida(movimento.descricao, investimento.tipo)
    if movimento.tipo == TipoDeMovimento.RENDIMENTO:
        if destinacoes:
            raise TransacaoImportadaInvalida("Rendimento não acrescenta principal às destinações.")
        movimento.investimento_id = investimento_id
        return []
    if movimento.tipo in (TipoDeMovimento.CUSTO, TipoDeMovimento.IMPOSTO):
        if destinacoes:
            raise TransacaoImportadaInvalida(
                "O custo herda as destinações da operação relacionada."
            )
        relacionado = uow.movimentos_de_investimento.obter(
            usuario_id, movimento.movimento_relacionado_id
        )
        if (
            relacionado is None
            or relacionado.investimento_id != investimento_id
            or relacionado.tipo not in (TipoDeMovimento.APORTE, TipoDeMovimento.RESGATE)
        ):
            raise TransacaoImportadaInvalida(
                "Escolha uma compra/aplicação ou venda/resgate desta posição."
            )
        movimento.investimento_id = investimento_id
        if relacionado.tipo == TipoDeMovimento.RESGATE:
            return []
        originais = uow.destinacoes.do_movimento([relacionado.id]).get(relacionado.id, [])
        total = sum(v.centavos for _, v in originais)
        if total <= 0:
            return []
        valores = repartir(movimento.valor.centavos, [v.centavos for _, v in originais], total)
        return [
            ParteDeDestinacao(tag, Dinheiro(valor))
            for (tag, _), valor in zip(originais, valores, strict=True)
            if valor > 0
        ]
    divisao = dividir_por_percentuais(movimento.valor, destinacoes)
    _abater_saldo_inicial_duplicado(uow, usuario_id, movimento, investimento_id)
    if movimento.tipo == TipoDeMovimento.RESGATE:
        partes = _partes_do_resgate(uow, usuario_id, movimento, investimento_id, divisao)
    else:
        partes = [ParteDeDestinacao(tag, valor) for tag, valor in divisao if valor.centavos]
    movimento.investimento_id = investimento_id
    return partes
