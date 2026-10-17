from dataclasses import dataclass

from gastoba.domain.portas import VerificadorDeBanco


@dataclass(frozen=True, slots=True)
class RelatorioDeSaude:
    banco_disponivel: bool

    @property
    def saudavel(self) -> bool:
        """True quando todas as dependências da aplicação estão disponíveis."""
        return self.banco_disponivel


class VerificarSaude:
    def __init__(self, verificador_de_banco: VerificadorDeBanco) -> None:
        self._verificador_de_banco = verificador_de_banco

    def executar(self) -> RelatorioDeSaude:
        return RelatorioDeSaude(banco_disponivel=self._verificador_de_banco.esta_disponivel())
