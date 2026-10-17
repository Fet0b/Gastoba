from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from gastoba.domain.chave_de_api import ChaveDeApi, EscopoDaChave
from gastoba.domain.portas import GeradorDeSegredo, Relogio, UnidadeDeTrabalho
from gastoba.domain.segredo_de_acesso import SegredoDeAcesso


@dataclass(frozen=True, slots=True)
class ChaveCriada:
    """A chave gravada e o segredo em claro, devolvido só nesta criação."""

    chave: ChaveDeApi
    segredo: SegredoDeAcesso


class CriarChaveDeApi:
    def __init__(
        self,
        unidade_de_trabalho: UnidadeDeTrabalho,
        gerador_de_segredo: GeradorDeSegredo,
        relogio: Relogio,
    ) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho
        self._gerador_de_segredo = gerador_de_segredo
        self._relogio = relogio

    def executar(
        self,
        usuario_id: UUID,
        nome: str,
        escopo: EscopoDaChave,
        expira_em: datetime | None = None,
    ) -> ChaveCriada:
        prefixo = self._gerador_de_segredo.gerar_prefixo()
        segredo = SegredoDeAcesso.de_chave_de_api(prefixo, self._gerador_de_segredo.gerar())
        with self._unidade_de_trabalho as uow:
            chave = ChaveDeApi(
                usuario_id=usuario_id,
                nome=nome,
                prefixo=prefixo,
                hash_do_segredo=segredo.hash_sha256,
                escopo=escopo,
                criada_em=self._relogio.agora(),
                expira_em=expira_em,
            )
            uow.chaves_de_api.adicionar(chave)
            uow.commit()
            return ChaveCriada(chave=chave, segredo=segredo)
