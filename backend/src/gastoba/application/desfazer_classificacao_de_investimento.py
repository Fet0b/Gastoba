import re
from dataclasses import dataclass
from uuid import UUID

from gastoba.application.abatimentos_do_saldo_inicial import restaurar_abatimentos
from gastoba.application.conferir_principal_disponivel import conferir_principal_disponivel
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import (
    DivisaoExigeConfirmacao,
    MovimentoDeInvestimentoNaoEncontrado,
    MovimentoNaoDesfazivel,
    TransacaoCasada,
)
from gastoba.domain.movimento_de_investimento import (
    MovimentoDeInvestimento,
    OrigemDoMovimento,
    TipoDeMovimento,
)
from gastoba.domain.portas import UnidadeDeTrabalho
from gastoba.domain.reversao_de_classificacao import ReversaoDeClassificacao
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    SentidoDaTransacao,
    TransacaoImportada,
)


@dataclass(frozen=True, slots=True)
class ClassificacaoDesfeita:
    transacao_id: UUID
    lancamentos_removidos: int
    estado: EstadoDaTransacaoImportada = EstadoDaTransacaoImportada.PENDENTE


def _origem_nao_identificada(movimento: MovimentoDeInvestimento) -> MovimentoNaoDesfazivel:
    if re.search(r" \(\d+/\d+\)$", movimento.descricao):
        return MovimentoNaoDesfazivel(
            "Esta divisão é anterior ao vínculo com a transação: não dá para identificar "
            "todas as partes com segurança. Nada foi alterado."
        )
    return MovimentoNaoDesfazivel(
        "Não dá para identificar com segurança a transação de origem deste aporte; "
        "nada foi alterado."
    )


def _transacao_sem_vinculo(
    uow: UnidadeDeTrabalho, usuario_id: UUID, movimento: MovimentoDeInvestimento
) -> TransacaoImportada:
    assert movimento.conta_id is not None
    campos = (movimento.conta_id, movimento.data, movimento.valor, movimento.descricao)
    sentido = (
        SentidoDaTransacao.SAIDA
        if movimento.tipo == TipoDeMovimento.APORTE
        else SentidoDaTransacao.ENTRADA
    )
    candidatas = uow.transacoes_importadas.aceitas_correspondentes_sem_vinculo(
        usuario_id, *campos, sentido
    )
    if (
        len(candidatas) != 1
        or uow.movimentos_de_investimento.contar_correspondentes_sem_vinculo(
            usuario_id, *campos, movimento.tipo
        )
        != 1
        or uow.gastos.existe_correspondente_sem_vinculo(usuario_id, *campos)
        or uow.ganhos.existe_correspondente_sem_vinculo(usuario_id, *campos)
    ):
        raise _origem_nao_identificada(movimento)
    return candidatas[0]


class DesfazerClassificacaoDeInvestimento:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        movimento_id: UUID,
        *,
        caixa_de_entrada_disponivel: bool,
        desfazer_divisao_inteira: bool = False,
    ) -> ClassificacaoDesfeita:
        if not caixa_de_entrada_disponivel:
            raise MovimentoNaoDesfazivel(
                "A caixa de entrada está desligada: a transação não teria para onde voltar. "
                "Nada foi alterado."
            )
        with self._unidade_de_trabalho as uow:
            movimento = uow.movimentos_de_investimento.obter(usuario_id, movimento_id)
            if movimento is None:
                raise MovimentoDeInvestimentoNaoEncontrado("Movimento não encontrado.")
            if movimento.origem != OrigemDoMovimento.OPEN_FINANCE:
                raise MovimentoNaoDesfazivel(
                    "Só a classificação vinda da caixa de entrada pode ser desfeita por aqui."
                )
            if movimento.transacao_importada_id is None:
                transacao = _transacao_sem_vinculo(uow, usuario_id, movimento)
                gastos, ganhos, movimentos = [], [], [movimento]
            else:
                transacao = uow.transacoes_importadas.obter(
                    usuario_id, movimento.transacao_importada_id
                )
                if transacao is None:
                    raise _origem_nao_identificada(movimento)
                gastos = uow.gastos.da_transacao(usuario_id, transacao.id)
                ganhos = uow.ganhos.da_transacao(usuario_id, transacao.id)
                movimentos = uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id)
            return reverter_grupo(
                uow,
                usuario_id,
                transacao,
                gastos,
                ganhos,
                movimentos,
                desfazer_divisao_inteira=desfazer_divisao_inteira,
            )


def reverter_grupo(
    uow,
    usuario_id,
    transacao,
    gastos,
    ganhos,
    movimentos,
    *,
    desfazer_divisao_inteira=False,
    coberturas_dependentes=(),
    confirmar=True,
) -> ClassificacaoDesfeita:
    if transacao.id in uow.casamentos.transacoes_casadas(usuario_id):
        raise TransacaoCasada("Desfaça a ligação na Revisão da bolsa.")
    uow.reaplicacoes_de_resgates.bloquear(usuario_id)
    if any(uow.reaplicacoes_de_resgates.para_movimento(usuario_id, m.id) for m in movimentos):
        raise MovimentoNaoDesfazivel("Desfaça primeiro a reaplicação vinculada a este movimento.")
    reservar_reversao(uow, transacao)
    grupo = [*gastos, *ganhos, *movimentos]
    relacionados = uow.movimentos_de_investimento.listar_relacionados(
        usuario_id, [m.id for m in movimentos]
    )
    if any(m.id not in {i.id for i in movimentos} for m in relacionados):
        raise MovimentoNaoDesfazivel(
            "Desfaça primeiro os custos ou impostos ligados a esta operação."
        )
    conta = uow.contas.obter(usuario_id, transacao.conta_id)
    if transacao.estado != EstadoDaTransacaoImportada.ACEITA:
        raise MovimentoNaoDesfazivel("A transação de origem já não está aceita. Nada foi alterado.")
    if conta is None or not conta.saldo_e_do_banco:
        raise MovimentoNaoDesfazivel(
            "Só uma transação de conta bancária conectada pode voltar à caixa de entrada."
        )
    if any(getattr(lancamento, "recorrencia_id", None) is not None for lancamento in grupo):
        raise MovimentoNaoDesfazivel("O grupo contém lançamento de recorrência. Nada foi alterado.")
    if sum(lancamento.valor.centavos for lancamento in grupo) != transacao.valor.centavos:
        raise MovimentoNaoDesfazivel(
            "Não dá para identificar todas as partes da transação com segurança. Nada foi alterado."
        )
    if len(grupo) > 1 and not desfazer_divisao_inteira:
        contagens = [
            ("gasto", len(gastos)),
            ("ganho", len(ganhos)),
            ("aporte", sum(m.tipo == TipoDeMovimento.APORTE for m in movimentos)),
            ("resgate", sum(m.tipo == TipoDeMovimento.RESGATE for m in movimentos)),
        ]
        tipos = " e ".join(f"{n} {tipo}{'s' if n != 1 else ''}" for tipo, n in contagens if n)
        raise DivisaoExigeConfirmacao(
            f"Esta transação foi dividida em {len(grupo)} partes ({tipos}). "
            "Desfazer remove todas as partes e devolve a transação inteira "
            "para a caixa de entrada."
        )
    partes = uow.destinacoes.do_movimento([m.id for m in movimentos])
    removido = {}
    for m in movimentos:
        if m.tipo == TipoDeMovimento.APORTE and m.categoria is not None:
            for tag, valor in partes.get(m.id, []):
                chave = (m.categoria, tag)
                removido[chave] = removido.get(chave, Dinheiro(0)) + valor
    coberturas_do_grupo = uow.coberturas.listar_dos_gastos([g.id for g in gastos])
    for (categoria, tag), valor in removido.items():
        reservado = uow.destinacoes.somar_reservado_por_tag(usuario_id, categoria).get(
            tag, Dinheiro(0)
        )
        coberto = uow.coberturas.somar_coberto_por_tag(usuario_id, categoria).get(tag, Dinheiro(0))
        coberto_removido = sum(
            c.valor.centavos
            for g in gastos
            if g.categoria == categoria
            for c in coberturas_do_grupo.get(g.id, [])
            if c.tag == tag
        )
        if reservado.centavos - valor.centavos < coberto.centavos - coberto_removido:
            raise MovimentoNaoDesfazivel(
                f"A reserva de «{tag}» já cobre compras: "
                "desfaça a associação da compra antes. Nada foi alterado."
            )
    if uow.coberturas.resgate_em_uso([m.id for m in movimentos]) and not coberturas_dependentes:
        raise MovimentoNaoDesfazivel(
            "Este resgate paga uma compra: desfaça a associação da compra antes. Nada foi alterado."
        )
    restaurar_abatimentos(uow, usuario_id, transacao.id, movimentos)
    conferir_principal_disponivel(uow, usuario_id, movimentos)
    registrar_reversao(uow, usuario_id, transacao, [*grupo, *coberturas_dependentes])
    for cobertura in coberturas_dependentes:
        uow.coberturas.remover(cobertura.id)
    uow.coberturas.remover_dos_gastos([g.id for g in gastos])
    for gasto in gastos:
        uow.gastos.remover(gasto.id)
    for ganho in ganhos:
        uow.ganhos.remover(ganho.id)
    for parte in movimentos:
        uow.movimentos_de_investimento.excluir(parte.id)
    transacao.reabrir()
    uow.transacoes_importadas.atualizar_estado(transacao)
    if confirmar:
        uow.commit()
    return ClassificacaoDesfeita(transacao.id, len(grupo))


def registrar_reversao(uow, usuario_id, transacao, grupo):
    uow.transacoes_importadas.registrar_reversao(
        ReversaoDeClassificacao.de_grupo(
            usuario_id,
            transacao,
            grupo,
            partes=uow.destinacoes.do_movimento(
                [i.id for i in grupo if isinstance(i, MovimentoDeInvestimento)]
            ),
            coberturas=uow.coberturas.listar_dos_gastos(
                [i.id for i in grupo if not isinstance(i, MovimentoDeInvestimento)]
            ),
        )
    )


def reservar_reversao(uow, transacao):
    quantidade = uow.transacoes_importadas.contar_reversoes(transacao.id)
    if not uow.transacoes_importadas.reservar_reversao(transacao.id, transacao.estado, quantidade):
        raise MovimentoNaoDesfazivel(
            "A classificação mudou durante a confirmação. Confira a prévia novamente."
        )
