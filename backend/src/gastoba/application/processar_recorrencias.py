import logging
from datetime import date
from uuid import UUID

from gastoba.domain.excecoes import ErroDeDominio
from gastoba.domain.ganho import Ganho
from gastoba.domain.gasto import Gasto
from gastoba.domain.mes import Mes, hoje_no_fuso_do_negocio
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.recorrencia import Recorrencia, TipoDeRecorrencia

_registro = logging.getLogger(__name__)


class ProcessarRecorrencias:
    """Cria o ganho ou o gasto de cada mês vencido das recorrências ativas.

    Idempotente: a competência (``AAAA-MM``) já gerada não é gerada de novo, então rodar duas
    vezes, ou depois de o servidor ter ficado parado, não duplica nem perde nada. Cada
    gasto ou ganho gerado é uma transação própria: um que falha não impede os demais.
    """

    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(self, usuario_id: UUID | None = None) -> int:
        """Gera o que está pendente (de um usuário ou de todos) e devolve quantos criou."""
        hoje = hoje_no_fuso_do_negocio(self._relogio.agora())
        pendentes = self._pendentes(usuario_id, hoje)
        criados = 0
        for recorrencia, competencia, data in pendentes:
            try:
                if self._gerar(recorrencia, competencia, data):
                    criados += 1
            except ErroDeDominio:
                # Sem valores, descrições nem identificadores no registro (Art. IV.3).
                _registro.warning("Não foi possível gerar um gasto ou ganho recorrente.")
        return criados

    def _pendentes(
        self, usuario_id: UUID | None, hoje: date
    ) -> list[tuple[Recorrencia, Mes, date]]:
        pendentes: list[tuple[Recorrencia, Mes, date]] = []
        with self._unidade_de_trabalho as uow:
            for recorrencia in uow.recorrencias.listar_ativas(usuario_id):
                repositorio = (
                    uow.ganhos if recorrencia.tipo is TipoDeRecorrencia.GANHO else uow.gastos
                )
                geradas = repositorio.competencias_geradas(recorrencia.id)
                pendentes.extend(
                    (recorrencia, mes, data)
                    for mes, data in recorrencia.ocorrencias_ate(hoje)
                    if str(mes) not in geradas
                )
        return pendentes

    def _gerar(self, recorrencia: Recorrencia, competencia: Mes, data: date) -> bool:
        with self._unidade_de_trabalho as uow:
            conta = uow.contas.obter(recorrencia.usuario_id, recorrencia.conta_id)
            if conta is None:
                return False
            if recorrencia.tipo is TipoDeRecorrencia.GANHO:
                ganho = Ganho(
                    conta_id=conta.id,
                    valor=recorrencia.valor,
                    descricao=recorrencia.descricao,
                    data=data,
                    tags=recorrencia.tags,
                    recorrencia_id=recorrencia.id,
                    competencia=str(competencia),
                )
                conta.creditar(ganho.valor)
                uow.ganhos.adicionar(ganho)
                uow.contas.creditar(conta.id, ganho.valor)
            else:
                assert recorrencia.categoria is not None  # garantido pela entidade
                gasto = Gasto(
                    conta_id=conta.id,
                    valor=recorrencia.valor,
                    descricao=recorrencia.descricao,
                    data=data,
                    categoria=recorrencia.categoria,
                    tags=recorrencia.tags,
                    recorrencia_id=recorrencia.id,
                    competencia=str(competencia),
                )
                conta.debitar(gasto.valor)
                uow.gastos.adicionar(gasto)
                uow.contas.debitar(conta.id, gasto.valor)
            uow.commit()
            return True
