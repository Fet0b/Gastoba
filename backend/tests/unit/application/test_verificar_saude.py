from gastoba.application.verificar_saude import VerificarSaude


class VerificadorDeBancoFalso:
    """Satisfaz a porta VerificadorDeBanco por tipagem estrutural, sem banco real."""

    def __init__(self, disponivel: bool) -> None:
        self._disponivel = disponivel

    def esta_disponivel(self) -> bool:
        return self._disponivel


def test_banco_disponivel_gera_relatorio_saudavel():
    relatorio = VerificarSaude(VerificadorDeBancoFalso(disponivel=True)).executar()

    assert relatorio.banco_disponivel is True
    assert relatorio.saudavel is True


def test_banco_indisponivel_gera_relatorio_nao_saudavel():
    relatorio = VerificarSaude(VerificadorDeBancoFalso(disponivel=False)).executar()

    assert relatorio.banco_disponivel is False
    assert relatorio.saudavel is False
