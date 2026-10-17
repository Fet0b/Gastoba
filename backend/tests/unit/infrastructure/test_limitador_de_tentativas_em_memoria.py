import threading
from datetime import UTC, datetime, timedelta

import pytest

from gastoba.domain.excecoes import MuitasTentativas
from gastoba.infrastructure.seguranca.limitador_de_tentativas_em_memoria import (
    LimitadorDeTentativasEmMemoria,
)

JANELA = timedelta(minutes=15)


class RelogioFalso:
    def __init__(self) -> None:
        self.instante = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)

    def agora(self) -> datetime:
        return self.instante

    def avancar(self, intervalo: timedelta) -> None:
        self.instante += intervalo


@pytest.fixture
def relogio():
    return RelogioFalso()


@pytest.fixture
def limitador(relogio):
    return LimitadorDeTentativasEmMemoria(limite=5, janela=JANELA, relogio=relogio)


def _tentar(limitador, vezes: int, chaves=("email:ana@x.com",)) -> None:
    for _ in range(vezes):
        limitador.registrar_tentativa(chaves)


def test_aceita_ate_o_limite_e_barra_a_seguinte(limitador):
    _tentar(limitador, 5)

    with pytest.raises(MuitasTentativas) as erro:
        limitador.registrar_tentativa(["email:ana@x.com"])

    assert erro.value.segundos_para_tentar_de_novo == 15 * 60


def test_tentativa_barrada_nao_conta_nem_estende_o_bloqueio(limitador, relogio):
    _tentar(limitador, 5)
    for _ in range(3):
        relogio.avancar(timedelta(minutes=1))
        with pytest.raises(MuitasTentativas):
            limitador.registrar_tentativa(["email:ana@x.com"])

    relogio.avancar(timedelta(minutes=12))

    limitador.registrar_tentativa(["email:ana@x.com"])


def test_retry_after_conta_a_partir_da_tentativa_mais_antiga_da_janela(limitador, relogio):
    _tentar(limitador, 1)
    relogio.avancar(timedelta(minutes=10))
    _tentar(limitador, 4)

    with pytest.raises(MuitasTentativas) as erro:
        limitador.registrar_tentativa(["email:ana@x.com"])

    assert erro.value.segundos_para_tentar_de_novo == 5 * 60
    relogio.avancar(timedelta(minutes=5))
    limitador.registrar_tentativa(["email:ana@x.com"])


def test_retry_after_arredonda_para_cima_e_nunca_e_zero(limitador, relogio):
    _tentar(limitador, 5)
    relogio.avancar(JANELA - timedelta(milliseconds=1))

    with pytest.raises(MuitasTentativas) as erro:
        limitador.registrar_tentativa(["email:ana@x.com"])

    assert erro.value.segundos_para_tentar_de_novo == 1


def test_chaves_sao_independentes(limitador):
    _tentar(limitador, 5, chaves=("email:ana@x.com",))

    limitador.registrar_tentativa(["email:bia@x.com"])


def test_qualquer_chave_no_limite_barra_e_nenhuma_conta(limitador):
    _tentar(limitador, 5, chaves=("origem:10.0.0.7",))

    with pytest.raises(MuitasTentativas):
        limitador.registrar_tentativa(["email:bia@x.com", "origem:10.0.0.7"])

    # O e-mail não ganhou a tentativa barrada: ainda aceita cinco.
    _tentar(limitador, 5, chaves=("email:bia@x.com",))


def test_zerar_libera_a_chave(limitador):
    _tentar(limitador, 5)

    limitador.zerar("email:ana@x.com")

    _tentar(limitador, 5)


def test_descontar_devolve_uma_tentativa(limitador):
    _tentar(limitador, 5)

    limitador.descontar("email:ana@x.com")

    _tentar(limitador, 1)
    with pytest.raises(MuitasTentativas):
        limitador.registrar_tentativa(["email:ana@x.com"])


def test_zerar_e_descontar_chave_desconhecida_nao_falham(limitador):
    limitador.zerar("email:nunca@x.com")
    limitador.descontar("email:nunca@x.com")

    assert limitador.quantidade_de_chaves == 0


def test_chaves_antigas_sao_esquecidas(limitador, relogio):
    for indice in range(50):
        limitador.registrar_tentativa([f"origem:10.0.0.{indice}"])
    assert limitador.quantidade_de_chaves == 50

    relogio.avancar(JANELA + timedelta(seconds=1))
    limitador.registrar_tentativa(["origem:10.0.1.1"])

    assert limitador.quantidade_de_chaves == 1


def test_numero_de_chaves_tem_teto(relogio):
    limitador = LimitadorDeTentativasEmMemoria(
        limite=5, janela=JANELA, relogio=relogio, maximo_de_chaves=10
    )

    for indice in range(25):
        limitador.registrar_tentativa([f"origem:10.0.0.{indice}"])

    assert limitador.quantidade_de_chaves <= 10


def test_concorrencia_nao_deixa_passar_do_limite(relogio):
    limitador = LimitadorDeTentativasEmMemoria(limite=10, janela=JANELA, relogio=relogio)
    aceitas = []
    trava = threading.Lock()
    largada = threading.Barrier(40)

    def tentar() -> None:
        largada.wait()
        try:
            limitador.registrar_tentativa(["email:ana@x.com"])
        except MuitasTentativas:
            return
        with trava:
            aceitas.append(1)

    threads = [threading.Thread(target=tentar) for _ in range(40)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(aceitas) == 10


@pytest.mark.parametrize(
    ("limite", "janela", "maximo"),
    [(0, JANELA, 10), (5, timedelta(0), 10), (5, JANELA, 0)],
)
def test_parametros_invalidos_sao_recusados(relogio, limite, janela, maximo):
    with pytest.raises(ValueError):
        LimitadorDeTentativasEmMemoria(
            limite=limite, janela=janela, relogio=relogio, maximo_de_chaves=maximo
        )
