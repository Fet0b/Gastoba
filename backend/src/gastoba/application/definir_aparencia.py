from uuid import UUID

from gastoba.domain.aparencia import Aparencia, IntensidadeDaCor, MarcaDoApp, TexturaDoFundo
from gastoba.domain.portas import UnidadeDeTrabalho


class DefinirAparencia:
    def __init__(self, unidade_de_trabalho: UnidadeDeTrabalho) -> None:
        self._unidade_de_trabalho = unidade_de_trabalho

    def executar(
        self,
        usuario_id: UUID,
        matiz: int,
        intensidade: IntensidadeDaCor,
        textura: TexturaDoFundo,
        nome: str,
        marca: MarcaDoApp,
    ) -> Aparencia:
        aparencia = Aparencia.de_escolhas(matiz, intensidade, textura, nome, marca)
        with self._unidade_de_trabalho as uow:
            uow.aparencias.salvar(usuario_id, aparencia)
            uow.commit()
            return aparencia
