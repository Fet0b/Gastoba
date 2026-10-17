from datetime import date
from uuid import UUID

from gastoba.application.processar_recorrencias import ProcessarRecorrencias
from gastoba.domain.categoria import CategoriaDoGasto
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.excecoes import ContaNaoEncontrada, RecorrenciaInvalida
from gastoba.domain.mes import hoje_no_fuso_do_negocio
from gastoba.domain.portas import Relogio, UnidadeDeTrabalho
from gastoba.domain.recorrencia import (
    ANOS_MAXIMOS_NO_PASSADO,
    LIMITE_DE_RECORRENCIAS_ATIVAS,
    Recorrencia,
    TipoDeRecorrencia,
)
from gastoba.domain.tag import Tag


class CriarRecorrencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho, relogio: Relogio) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._relogio = relogio

    def executar(
        self,
        usuario_id: UUID,
        tipo: TipoDeRecorrencia,
        conta_id: UUID,
        valor: Dinheiro,
        descricao: str,
        dia_do_mes: int,
        inicio: date,
        categoria: CategoriaDoGasto | None,
        tags: list[str],
        fim: date | None,
    ) -> Recorrencia:
        """Grava a recorrência e já gera os meses vencidos desde o início."""
        hoje = hoje_no_fuso_do_negocio(self._relogio.agora())
        if inicio < _anos_antes(hoje, ANOS_MAXIMOS_NO_PASSADO):
            raise RecorrenciaInvalida(
                f"O início da recorrência não pode ser mais de {ANOS_MAXIMOS_NO_PASSADO} anos "
                "no passado."
            )
        with self._unidade_de_trabalho as uow:
            if uow.contas.obter(usuario_id, conta_id) is None:
                raise ContaNaoEncontrada("Conta não encontrada.")
            recorrencia = Recorrencia(
                usuario_id=usuario_id,
                tipo=tipo,
                conta_id=conta_id,
                valor=valor,
                descricao=descricao,
                dia_do_mes=dia_do_mes,
                inicio=inicio,
                categoria=categoria,
                tags=tuple(Tag.de_texto(tag) for tag in tags),
                fim=fim,
            )
            if uow.recorrencias.contar_ativas(usuario_id) >= LIMITE_DE_RECORRENCIAS_ATIVAS:
                raise RecorrenciaInvalida(
                    f"Cada pessoa pode ter no máximo {LIMITE_DE_RECORRENCIAS_ATIVAS} "
                    "recorrências ativas."
                )
            uow.recorrencias.adicionar(recorrencia)
            uow.commit()
        ProcessarRecorrencias(self._unidade_de_trabalho, self._relogio).executar(usuario_id)
        return recorrencia


def _anos_antes(data: date, anos: int) -> date:
    try:
        return data.replace(year=data.year - anos)
    except ValueError:  # 29 de fevereiro
        return data.replace(year=data.year - anos, day=28)
