import json
import logging
from dataclasses import dataclass, replace
from datetime import timedelta

from gastoba.domain.conta import Conta, OrigemDaConta, TipoDaConta
from gastoba.domain.email import Email
from gastoba.domain.excecoes import ContaJaExiste, ErroDeDominio, ProvedorIndisponivel
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.operacao import OrigemDaOperacao, TipoDeOperacao
from gastoba.domain.operacao_da_corretora import (
    converter_operacao_externa,
    inferir_quantidade_faltante,
)
from gastoba.domain.portas import (
    ContaExterna,
    ProvedorOpenFinance,
    Relogio,
    UnidadeDeTrabalho,
)
from gastoba.domain.quantidade_observada import quantidade_observada_da_posicao
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    TransacaoImportada,
    descartar_na_importacao,
    motivo_do_descarte_na_importacao,
)

_registro = logging.getLogger(__name__)

SOBREPOSICAO_EM_DIAS = 7
# Quantos nomes (``Nome``, ``Nome (2)``, ...) se tenta antes de desistir de uma conta repetida.
TENTATIVAS_DE_NOME = 100


@dataclass(frozen=True, slots=True)
class ResultadoDaSincronizacao:
    contas: int
    novas: int
    falhas: int


class SincronizarContasBancarias:
    """Traz do banco (Open Finance) as contas, os saldos e as transações novas da pessoa dona.

    Idempotente: rodar de novo não duplica nada. Uma falha do provedor, de uma conta ou de uma
    transação é contada e não impede o resto. Nada vai para o log além do tipo do erro.
    """

    def __init__(
        self,
        unidade_de_trabalho: UnidadeDeTrabalho,
        provedor: ProvedorOpenFinance,
        relogio: Relogio,
        ids_dos_itens: tuple[str, ...],
        email_do_dono: str,
        dias_iniciais: int,
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._provedor = provedor
        self._relogio = relogio
        self._ids_dos_itens = ids_dos_itens
        self._email_do_dono = email_do_dono
        self._dias_iniciais = dias_iniciais

    def executar(self) -> ResultadoDaSincronizacao:
        with self._unidade_de_trabalho as uow:
            dono = uow.usuarios.obter_por_email(Email.de_texto(self._email_do_dono))
        if dono is None:
            return ResultadoDaSincronizacao(contas=0, novas=0, falhas=1)

        contas = novas = falhas = 0
        for id_do_item in self._ids_dos_itens:
            falhas += self._sincronizar_investimentos(dono.id, id_do_item)
            try:
                externas = self._provedor.listar_contas(id_do_item)
            except ProvedorIndisponivel as erro:
                _registro.warning(
                    "Provedor indisponível ao listar as contas de um item (%s).", erro.motivo
                )
                falhas += 1
                continue
            for externa in externas:
                try:
                    novas_da_conta, falhas_da_conta = self._sincronizar_conta(dono.id, externa)
                except ProvedorIndisponivel as erro:
                    _registro.warning(
                        "Provedor indisponível ao listar as transações de uma conta (%s).",
                        erro.motivo,
                    )
                    falhas += 1
                    continue
                contas += 1
                novas += novas_da_conta
                falhas += falhas_da_conta
        return ResultadoDaSincronizacao(contas=contas, novas=novas, falhas=falhas)

    def _sincronizar_investimentos(self, usuario_id, id_do_item: str) -> int:
        """Guarda as posições do item; uma falha aqui não impede contas e transações."""
        try:
            posicoes = self._provedor.listar_investimentos(id_do_item)
        except ProvedorIndisponivel as erro:
            _registro.warning(
                "Provedor indisponível ao listar os investimentos de um item (%s).", erro.motivo
            )
            return 1
        hoje = hoje_no_fuso_do_negocio(self._relogio.agora())
        with self._unidade_de_trabalho as uow:
            anteriores = {e.id_externo: e for e in uow.investimentos.listar(usuario_id)}
            for posicao in posicoes:
                anterior = anteriores.get(posicao.id_externo)
                if anterior is not None:
                    pendencias = json.loads(anterior.dados).get("gastoba_pendencias_de_operacoes")
                    if pendencias is not None:
                        registro = json.loads(posicao.dados)
                        registro["gastoba_pendencias_de_operacoes"] = pendencias
                        posicao = replace(posicao, dados=json.dumps(registro))
                uow.investimentos.salvar_posicao(usuario_id, posicao, hoje)
            uow.commit()
        return sum(self._sincronizar_operacoes(usuario_id, posicao) for posicao in posicoes)

    def _sincronizar_operacoes(self, usuario_id, externo) -> int:
        """Guarda as operações da posição (idempotente por ``id_externo``). Uma falha aqui não
        impede as demais posições, contas e transações."""
        try:
            operacoes = self._provedor.listar_operacoes_do_investimento(externo.id_externo)
        except ProvedorIndisponivel as erro:
            _registro.warning(
                "Provedor indisponível ao listar as operações de um investimento (%s).",
                erro.motivo,
            )
            return 1
        agora = self._relogio.agora()
        with self._unidade_de_trabalho as uow:
            posicao = next(
                (
                    i
                    for i in uow.investimentos.listar_posicoes(usuario_id)
                    if i.id_externo == externo.id_externo
                ),
                None,
            )
            if posicao is None or not uow.operacoes.garantir_posicao(usuario_id, posicao.id):
                return 0
            uow.operacoes.definir_observacao(
                usuario_id,
                posicao.id,
                quantidade_observada_da_posicao(posicao.tipo, posicao.saldo, externo.dados),
                posicao.saldo,
                agora,
            )
            novas = []
            pendencias = []
            existentes = uow.operacoes.listar_da_posicao(usuario_id, posicao.id)
            for externa in operacoes:
                operacao = converter_operacao_externa(
                    externa,
                    posicao.id,
                    posicao.tipo,
                    posicao.encerrado,
                    saldo_anterior=uow.investimentos.saldo_antes_de(
                        usuario_id, posicao.id, externa.data
                    ),
                )
                motivo = None
                if operacao is None:
                    motivo = (
                        "resgate_sem_historico" if externa.tipo == "SELL" else "tipo_sem_traducao"
                    )
                elif any(
                    o.origem == OrigemDaOperacao.MANUAL
                    and o.tipo == operacao.tipo
                    and o.data == operacao.data
                    and o.quantidade == operacao.quantidade
                    and o.valor_bruto == operacao.valor_bruto
                    for o in existentes
                ):
                    motivo = "possivel_duplicidade"
                elif uow.operacoes.adicionar(usuario_id, operacao):
                    novas.append(operacao)
                else:
                    # Já existe: a corretora é a fonte do custo, então ele é corrigido se mudou.
                    gravada = next(
                        (
                            o
                            for o in existentes
                            if o.origem == OrigemDaOperacao.PLUGGY
                            and o.id_externo == operacao.id_externo
                        ),
                        None,
                    )
                    if gravada is not None:
                        # Compra gravada antes com 0 cotas, agora sabida como sem quantidade.
                        marcar = (
                            operacao.quantidade_estimada
                            and gravada.quantidade == 0
                            and not gravada.quantidade_estimada
                        )
                        if marcar or gravada.custos != operacao.custos:
                            uow.operacoes.atualizar(
                                usuario_id,
                                replace(
                                    gravada,
                                    custos=operacao.custos,
                                    quantidade_estimada=gravada.quantidade_estimada or marcar,
                                ),
                            )
                if motivo:
                    pendencia = {
                        "tipo": externa.tipo,
                        "data": externa.data.isoformat(),
                        "motivo": motivo,
                    }
                    if pendencia not in pendencias:
                        pendencias.append(pendencia)
            anteriores = [
                e
                for e in uow.investimentos.listar(usuario_id)
                if e.id_externo == externo.id_externo
            ]
            tinha_retrato = any(
                "gastoba_pendencias_de_operacoes" in json.loads(e.dados) for e in anteriores
            )
            if pendencias or tinha_retrato:
                registro = json.loads(externo.dados)
                registro["gastoba_pendencias_de_operacoes"] = pendencias
                uow.investimentos.salvar_posicao(
                    usuario_id,
                    replace(externo, dados=json.dumps(registro)),
                    hoje_no_fuso_do_negocio(agora),
                )
            self._substituir_abertura_estimada(uow, usuario_id, posicao.id, novas)
            inferida = inferir_quantidade_faltante(
                uow.operacoes.listar_da_posicao(usuario_id, posicao.id),
                quantidade_observada_da_posicao(posicao.tipo, posicao.saldo, externo.dados),
            )
            if inferida is not None:
                uow.operacoes.atualizar(usuario_id, inferida)
            uow.commit()
        return 0

    @staticmethod
    def _substituir_abertura_estimada(uow, usuario_id, posicao_id, novas) -> None:
        """A compra da corretora de mesmo valor tira a abertura *estimada* (RF-015): senão o valor
        aplicado contaria em dobro. Só com exatamente uma compra igual; abertura confirmada ou de
        outro valor fica, e o resto é pendência visível."""
        compras = [o for o in novas if o.tipo == TipoDeOperacao.COMPRA]
        for abertura in uow.operacoes.listar_da_posicao(usuario_id, posicao_id):
            if (
                abertura.tipo == TipoDeOperacao.ABERTURA
                and abertura.origem == OrigemDaOperacao.ABERTURA
                and abertura.quantidade_estimada
                and sum(1 for c in compras if c.valor_bruto == abertura.valor_bruto) == 1
            ):
                uow.operacoes.remover(usuario_id, abertura.id)

    def _sincronizar_conta(self, usuario_id, externa: ContaExterna) -> tuple[int, int]:
        hoje = hoje_no_fuso_do_negocio(self._relogio.agora())
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter_por_id_externo(usuario_id, externa.id_externo)
            if conta is None:
                conta = self._criar_conta(uow, usuario_id, externa)
            else:
                # A conta que já virou remunerada não volta a corrente a cada rodada.
                tipo = (
                    TipoDaConta.REMUNERADA
                    if conta.tipo == TipoDaConta.REMUNERADA and externa.tipo == TipoDaConta.CORRENTE
                    else externa.tipo
                )
                uow.contas.atualizar_do_banco(
                    conta.id, externa.saldo, tipo, externa.nome, externa.final_do_numero
                )
            ultima = uow.transacoes_importadas.data_mais_recente(conta.id)
            uow.commit()
        desde = (
            ultima - timedelta(days=SOBREPOSICAO_EM_DIAS)
            if ultima is not None
            else hoje - timedelta(days=self._dias_iniciais)
        )

        externas = self._provedor.listar_transacoes(externa.id_externo, desde)
        novas = falhas = 0
        with self._unidade_de_trabalho as uow:
            for transacao in externas:
                try:
                    candidata = TransacaoImportada(
                        conta_id=conta.id,
                        id_externo=transacao.id_externo,
                        data=transacao.data,
                        descricao=transacao.descricao,
                        valor=transacao.valor,
                        sentido=transacao.sentido,
                        tipo_de_operacao=transacao.tipo_de_operacao,
                        estado=(
                            EstadoDaTransacaoImportada.IGNORADA
                            if descartar_na_importacao(
                                transacao.tipo_de_operacao, transacao.descricao
                            )
                            else EstadoDaTransacaoImportada.PENDENTE
                        ),
                        motivo_ignorada=motivo_do_descarte_na_importacao(
                            transacao.tipo_de_operacao, transacao.descricao
                        ),
                    )
                except ErroDeDominio:
                    falhas += 1
                    continue
                # Só contam como novas as que chegam à caixa de entrada.
                gravada = uow.transacoes_importadas.adicionar_se_nova(candidata)
                if gravada and candidata.estado == EstadoDaTransacaoImportada.PENDENTE:
                    novas += 1
            uow.commit()
        return novas, falhas

    @staticmethod
    def _criar_conta(uow: UnidadeDeTrabalho, usuario_id, externa: ContaExterna) -> Conta:
        # Nome já em uso (conta manual ou outra do mesmo banco): a importada ganha um número
        # sequencial. Nada do id externo aparece no nome.
        for numero in range(1, TENTATIVAS_DE_NOME + 1):
            nome = externa.nome if numero == 1 else f"{externa.nome[:90]} ({numero})"
            conta = Conta(
                usuario_id=usuario_id,
                nome=nome,
                saldo=externa.saldo,
                origem=OrigemDaConta.OPEN_FINANCE,
                id_externo=externa.id_externo,
                tipo=externa.tipo,
                nome_no_banco=externa.nome,
                final_do_numero=externa.final_do_numero,
            )
            try:
                uow.contas.adicionar(conta)
            except ContaJaExiste:
                continue
            return conta
        raise ContaJaExiste("Não foi possível dar um nome único à conta importada.")
