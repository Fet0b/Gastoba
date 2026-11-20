"""Reconciliação mensal: dado o extrato da BTG, a caixinha do Gastoba fecha com o saldo remunerado.

Extrato fictício de outubro: aplicações 1.421,00 + 143,13 + 956,45 = 2.520,58; resgates 1.000,00 +
600,00 = 1.600,00; rendimento 41,59; saldo final remunerado 962,17.
"""

from datetime import UTC, date, datetime

from gastoba.application.listar_investimentos import ListarInvestimentos
from gastoba.application.sincronizar_contas_bancarias import SincronizarContasBancarias
from gastoba.domain.dinheiro import Dinheiro
from gastoba.domain.email import Email
from gastoba.domain.portas import ContaExterna, TransacaoExterna
from gastoba.domain.transacao_importada import EstadoDaTransacaoImportada, SentidoDaTransacao
from gastoba.domain.usuario import Usuario

EMAIL = "dono@exemplo.com"
SALDO_REMUNERADO = 96217
APLICACOES = [("a1", 142100, 4), ("a2", 14313, 7), ("a3", 95645, 10)]
RESGATES = [("r1", 100000, 8), ("r2", 60000, 11)]
RENDIMENTO = 4159


class RelogioFixo:
    def agora(self):
        return datetime(2026, 10, 13, 15, 0, tzinfo=UTC)


class ProvedorDoExtrato:
    def listar_contas(self, id_do_item):
        return [ContaExterna("btg-inv", "BTG Investimentos", Dinheiro(SALDO_REMUNERADO))]

    def listar_operacoes_do_investimento(self, id_do_investimento):
        return []

    def listar_investimentos(self, id_do_item):
        return []

    def listar_faturas(self, id_da_conta):
        return []

    def listar_transacoes(self, id_da_conta, desde):
        def linha(id_externo, centavos, dia, sentido, texto):
            return TransacaoExterna(
                id_externo=id_externo,
                valor=Dinheiro(centavos),
                descricao=texto,
                data=date(2026, 10, dia),
                sentido=sentido,
                tipo_de_operacao="TRANSFERENCIA_MESMA_INSTITUICAO",
            )

        return [
            linha(i, v, d, SentidoDaTransacao.SAIDA, "CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA")
            for i, v, d in APLICACOES
        ] + [
            linha(i, v, d, SentidoDaTransacao.ENTRADA, "CONTA REMUNERADA - RESGATE AUTOMÁTICO")
            for i, v, d in RESGATES
        ]


def test_extrato_do_mes_nao_leva_nenhum_espelho_a_caixa_nem_cria_movimento(unidade_de_trabalho):
    """Depois da 071 a aplicação e o resgate automáticos entram ignorados: a caixa fica vazia, sem
    aporte nem resgate da caixinha, e a posição mostra só o saldo do banco."""
    dono = Usuario(nome="Dono", email=Email.de_texto(EMAIL))
    unidade_de_trabalho.confirmado.usuarios[dono.id] = dono
    resultado = SincronizarContasBancarias(
        unidade_de_trabalho, ProvedorDoExtrato(), RelogioFixo(), ("item",), EMAIL, 30
    ).executar()

    from gastoba.application.definir_caixinha import DefinirCaixinha

    with unidade_de_trabalho as u:
        [conta] = u.contas.listar(dono.id)
    DefinirCaixinha(unidade_de_trabalho).executar(
        dono.id, conta.id, Dinheiro(SALDO_REMUNERADO), date(2026, 10, 13)
    )
    with unidade_de_trabalho as u:
        pendentes = u.transacoes_importadas.listar(dono.id, EstadoDaTransacaoImportada.PENDENTE)
        ignoradas = u.transacoes_importadas.listar(dono.id, EstadoDaTransacaoImportada.IGNORADA)
    assert resultado.novas == 0
    assert pendentes == []
    assert len(ignoradas) == len(APLICACOES) + len(RESGATES)

    (posicao,) = ListarInvestimentos(unidade_de_trabalho).executar(dono.id)
    assert posicao.investimento.saldo == Dinheiro(SALDO_REMUNERADO)
