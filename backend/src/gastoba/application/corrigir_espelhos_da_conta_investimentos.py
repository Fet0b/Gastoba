from dataclasses import dataclass, field
from uuid import UUID

from gastoba.application.aprovar_tratamentos_de_aporte import aprovar_sem_confirmar
from gastoba.application.desfazer_classificacao_importada import desfazer_sem_confirmar
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.natureza_do_movimento import NaturezaDoMovimento, natureza_da_descricao
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.transacao_importada import (
    EstadoDaTransacaoImportada,
    MotivoDaTransacaoIgnorada,
    TransacaoImportada,
)


@dataclass(slots=True)
class GrupoDeEspelhos:
    """Contagem e soma de um grupo: nunca o valor, a descrição nem o id de cada transação."""

    quantidade: int = 0
    total: Dinheiro = field(default_factory=lambda: Dinheiro(0))

    def somar(self, transacao: TransacaoImportada) -> None:
        self.quantidade += 1
        self.total = self.total + transacao.valor


@dataclass(slots=True)
class RelatorioDosEspelhos:
    aceitas_como_ganho: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    aceitas_como_aporte: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    aceitas_como_gasto: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    pendentes: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    ignoradas_sem_motivo: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    # Ignoradas pela pessoa com outro motivo (transferência entre contas): não são tocadas.
    ignoradas_com_outro_motivo: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    ja_corretas: GrupoDeEspelhos = field(default_factory=GrupoDeEspelhos)
    # Espelhos que não podem ser corrigidos, por motivo (só a contagem).
    recusadas: dict[str, int] = field(default_factory=dict)
    lancamentos_removidos: int = 0
    tratamentos_confirmados: int = 0
    aplicado: bool = False

    @property
    def nada_a_fazer(self) -> bool:
        return not self.recusadas and not any(
            g.quantidade
            for g in (
                self.aceitas_como_ganho,
                self.aceitas_como_aporte,
                self.aceitas_como_gasto,
                self.pendentes,
                self.ignoradas_sem_motivo,
            )
        )


class CorrigirEspelhosDaContaInvestimentos:
    """Corrige, uma vez, os espelhos (aplicação e resgate automáticos da conta investimentos) já
    gravados: cada um termina ignorado como movimento interno da conta, e os ganhos e aportes que
    ele gerou saem, com a reversão registrada.

    Tudo numa unidade de trabalho só. Na simulação (``aplicar=False``) roda a mesma lógica e
    descarta no fim. Se algum espelho tem dependência (cobertura, reaplicação, destinação,
    transferência ou ligação da Revisão da bolsa), nada é gravado, nem com ``aplicar``: o relatório
    traz só a contagem por motivo. Idempotente.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID, *, aplicar: bool) -> RelatorioDosEspelhos:
        relatorio = RelatorioDosEspelhos()
        with self._unidade_de_trabalho as uow:
            # Lista tudo antes de mexer: corrigir muda o estado, e o espelho não conta duas vezes.
            conta_remunerada = NaturezaDoMovimento.CONTA_REMUNERADA
            espelhos = [
                transacao
                for estado in EstadoDaTransacaoImportada
                for transacao in uow.transacoes_importadas.listar(usuario_id, estado)
                if natureza_da_descricao(transacao.descricao) == conta_remunerada
            ]
            for transacao in espelhos:
                self._corrigir(uow, usuario_id, transacao, relatorio)
            if aplicar and not relatorio.recusadas:
                uow.commit()
                relatorio.aplicado = True
        return relatorio

    def _corrigir(
        self,
        uow: UnidadeDeTrabalho,
        usuario_id: UUID,
        transacao: TransacaoImportada,
        relatorio: RelatorioDosEspelhos,
    ) -> None:
        if transacao.estado == EstadoDaTransacaoImportada.PENDENTE:
            relatorio.pendentes.somar(transacao)
        elif transacao.estado == EstadoDaTransacaoImportada.IGNORADA:
            if transacao.motivo_ignorada == MotivoDaTransacaoIgnorada.MOVIMENTO_INTERNO_DA_CONTA:
                relatorio.ja_corretas.somar(transacao)
                return
            if transacao.motivo_ignorada is not None:
                relatorio.ignoradas_com_outro_motivo.somar(transacao)
                return
            relatorio.ignoradas_sem_motivo.somar(transacao)
        else:
            if not self._desfazer_o_aceite(uow, usuario_id, transacao, relatorio):
                return
            if transacao.estado == EstadoDaTransacaoImportada.IGNORADA:
                return  # o aporte tratado já voltou ignorado, com o motivo
        transacao.marcar_como_movimento_interno()
        uow.transacoes_importadas.atualizar_estado(transacao)

    def _desfazer_o_aceite(
        self,
        uow: UnidadeDeTrabalho,
        usuario_id: UUID,
        transacao: TransacaoImportada,
        relatorio: RelatorioDosEspelhos,
    ) -> bool:
        """Tira o lançamento que o espelho gerou. ``False`` se há dependência (a transação fica)."""
        gastos = uow.gastos.da_transacao(usuario_id, transacao.id)
        ganhos = uow.ganhos.da_transacao(usuario_id, transacao.id)
        movimentos = uow.movimentos_de_investimento.da_transacao(usuario_id, transacao.id)
        grupo = (
            relatorio.aceitas_como_ganho
            if ganhos
            else relatorio.aceitas_como_aporte
            if movimentos
            else relatorio.aceitas_como_gasto
        )
        grupo.somar(transacao)
        motivo = self._dependencia(uow, usuario_id, transacao, gastos, ganhos, movimentos)
        if motivo is not None:
            relatorio.recusadas[motivo] = relatorio.recusadas.get(motivo, 0) + 1
            return False
        tratamentos = [uow.tratamentos.ativo_do_movimento(usuario_id, m.id) for m in movimentos]
        if movimentos and not gastos and not ganhos and all(tratamentos):
            # A FK impede apagar o movimento tratado: confirma o tratamento (exclusão lógica), que
            # também tira a transação de aceita (volta ignorada, por ser movimento interno).
            reaberta = False
            for tratamento in tratamentos:
                if tratamento is not None and tratamento.aprovado_em is None:
                    aprovar_sem_confirmar(uow, usuario_id, tratamento, self._relogio.agora())
                    relatorio.tratamentos_confirmados += 1
                    reaberta = True
            # A aprovação já gravou a transação; aqui só espelha o estado na cópia em mãos.
            transacao.devolver_a_caixa()
            if not reaberta:
                uow.transacoes_importadas.atualizar_estado(transacao)
            return True
        if any(tratamentos):
            relatorio.recusadas["tratamento_parcial"] = (
                relatorio.recusadas.get("tratamento_parcial", 0) + 1
            )
            return False
        try:
            desfeita = desfazer_sem_confirmar(uow, usuario_id, transacao.id, confirmar=False)
        except ErroDeDominio:
            relatorio.recusadas["nao_desfazivel"] = relatorio.recusadas.get("nao_desfazivel", 0) + 1
            return False
        relatorio.lancamentos_removidos += desfeita.lancamentos_removidos
        transacao.reabrir()
        return True

    @staticmethod
    def _dependencia(uow, usuario_id, transacao, gastos, ganhos, movimentos) -> str | None:
        if not (gastos or ganhos or movimentos):
            return "sem_lancamento"
        if transacao.id in uow.casamentos.transacoes_casadas(usuario_id):
            return "ligada_a_bolsa"
        if uow.transferencias.da_transacao(usuario_id, transacao.id):
            return "ligada_a_transferencia"
        ids = [m.id for m in movimentos]
        if any(uow.destinacoes.do_movimento(ids).values()):
            return "com_destinacao"
        if any(uow.reaplicacoes_de_resgates.para_movimento(usuario_id, i) for i in ids):
            return "com_reaplicacao"
        if uow.coberturas.resgate_em_uso(ids) or any(
            uow.coberturas.listar_dos_gastos([g.id for g in gastos]).values()
        ):
            return "com_cobertura"
        return None
