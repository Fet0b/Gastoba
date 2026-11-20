from dataclasses import dataclass
from enum import StrEnum

from gastoba.domain.excecoes import AparenciaInvalida

NOME_PADRAO_DO_APP = "Gastoba"
TAMANHO_MAXIMO_DO_NOME_DO_APP = 20
MATIZ_PADRAO = 258  # o roxo original do app


class IntensidadeDaCor(StrEnum):
    SUAVE = "suave"
    MEDIA = "media"
    VIVA = "viva"


class TexturaDoFundo(StrEnum):
    NENHUMA = "nenhuma"
    PONTOS = "pontos"
    LINHAS = "linhas"
    GRADE = "grade"
    GRAO = "grao"


class MarcaDoApp(StrEnum):
    OLHO = "olho"
    INICIAL = "inicial"
    MOEDA = "moeda"
    COFRE = "cofre"
    FOLHA = "folha"
    GRAFICO = "grafico"


@dataclass(frozen=True, slots=True)
class Aparencia:
    """Escolhas visuais de uma pessoa: cor dominante, textura de fundo, nome e logo do app."""

    matiz: int
    intensidade: IntensidadeDaCor
    textura: TexturaDoFundo
    nome: str
    marca: MarcaDoApp

    def __post_init__(self) -> None:
        if isinstance(self.matiz, bool) or not isinstance(self.matiz, int):
            raise AparenciaInvalida("A matiz deve ser um número inteiro de 0 a 359.")
        if not 0 <= self.matiz <= 359:
            raise AparenciaInvalida("A matiz deve ser um número inteiro de 0 a 359.")
        if self.nome != self.nome.strip():
            raise AparenciaInvalida("Use o nome do app sem espaços nas pontas.")
        if not 1 <= len(self.nome) <= TAMANHO_MAXIMO_DO_NOME_DO_APP:
            raise AparenciaInvalida(
                f"O nome do app deve ter de 1 a {TAMANHO_MAXIMO_DO_NOME_DO_APP} caracteres."
            )
        if not self.nome.isprintable():
            raise AparenciaInvalida("O nome do app não pode ter caracteres não imprimíveis.")

    @classmethod
    def de_escolhas(
        cls,
        matiz: int,
        intensidade: IntensidadeDaCor,
        textura: TexturaDoFundo,
        nome: str,
        marca: MarcaDoApp,
    ) -> Aparencia:
        """Como o construtor, mas apara os espaços das pontas do nome digitado."""
        return cls(matiz, intensidade, textura, nome.strip(), marca)

    @classmethod
    def padrao(cls) -> Aparencia:
        return cls(
            matiz=MATIZ_PADRAO,
            intensidade=IntensidadeDaCor.MEDIA,
            textura=TexturaDoFundo.NENHUMA,
            nome=NOME_PADRAO_DO_APP,
            marca=MarcaDoApp.OLHO,
        )
