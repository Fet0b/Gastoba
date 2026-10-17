import logging
from dataclasses import dataclass
from datetime import timedelta

from gastoba.domain.conta import Conta, OrigemDaConta
from gastoba.domain.email import Email
from gastoba.domain.excecoes import ContaJaExiste, ErroDeDominio, ProvedorIndisponivel
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.portas import (
    ContaExterna,
    ProvedorOpenFinance,
    Relogio,
    UnidadeDeTrabalho,
)
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    TransacaoImportada,
    descartar_na_importacao,
)

_registro = logging.getLogger(__name__)

SOBREPOSICAO_EM_DIAS = 7


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
            try:
                externas = self._provedor.listar_contas(id_do_item)
            except ProvedorIndisponivel:
                _registro.warning("Provedor indisponível ao listar as contas de um item.")
                falhas += 1
                continue
            for externa in externas:
                try:
                    novas_da_conta, falhas_da_conta = self._sincronizar_conta(dono.id, externa)
                except ProvedorIndisponivel:
                    _registro.warning("Provedor indisponível ao listar as transações de uma conta.")
                    falhas += 1
                    continue
                contas += 1
                novas += novas_da_conta
                falhas += falhas_da_conta
        return ResultadoDaSincronizacao(contas=contas, novas=novas, falhas=falhas)

    def _sincronizar_conta(self, usuario_id, externa: ContaExterna) -> tuple[int, int]:
        hoje = hoje_no_fuso_do_negocio(self._relogio.agora())
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter_por_id_externo(usuario_id, externa.id_externo)
            if conta is None:
                conta = self._criar_conta(uow, usuario_id, externa)
            else:
                uow.contas.atualizar_do_banco(conta.id, externa.saldo, externa.tipo)
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
                            if descartar_na_importacao(transacao.tipo_de_operacao)
                            else EstadoDaTransacaoImportada.PENDENTE
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
        # Se a pessoa já tem uma conta manual com esse nome, a importada ganha um sufixo.
        for nome in (externa.nome, f"{externa.nome[:90]} ({externa.id_externo[:6]})"):
            conta = Conta(
                usuario_id=usuario_id,
                nome=nome,
                saldo=externa.saldo,
                origem=OrigemDaConta.OPEN_FINANCE,
                id_externo=externa.id_externo,
                tipo=externa.tipo,
            )
            try:
                uow.contas.adicionar(conta)
            except ContaJaExiste:
                continue
            return conta
        raise ContaJaExiste("Não foi possível dar um nome único à conta importada.")
