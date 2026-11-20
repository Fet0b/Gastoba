from typing import TextIO

from gastoba.application.corrigir_espelhos_da_conta_investimentos import (
    GrupoDeEspelhos,
    RelatorioDosEspelhos,
)

_MOTIVOS = {
    "sem_lancamento": "aceita, mas sem ganho, gasto ou aporte ligado",
    "ligada_a_bolsa": "ligada a uma operação na Revisão da bolsa",
    "ligada_a_transferencia": "parte de uma transferência entre contas",
    "com_destinacao": "aporte com destinação (caixinha) registrada",
    "com_reaplicacao": "aporte ou resgate com reaplicação vinculada",
    "com_cobertura": "resgate ou gasto com cobertura de compra",
    "tratamento_parcial": "aporte com tratamento junto de lançamento sem tratamento",
    "nao_desfazivel": "a reversão da classificação foi recusada",
}


def _grupo(rotulo: str, grupo: GrupoDeEspelhos, saida: TextIO) -> None:
    print(f"  {rotulo}: {grupo.quantidade} (R$ {grupo.total.em_reais:.2f})", file=saida)


def imprimir(relatorio: RelatorioDosEspelhos, aplicar: bool, saida: TextIO) -> None:
    """Só contagens e somas por grupo: nenhuma descrição, id nem valor individual."""
    if aplicar:
        titulo = "APLICADO" if relatorio.aplicado else "NÃO APLICADO (nada foi gravado)"
    else:
        titulo = "SIMULAÇÃO (nada foi gravado; use --aplicar)"
    print(titulo, file=saida)
    print("\nEspelhos da conta investimentos, por situação atual:", file=saida)
    _grupo("aceitos como ganho", relatorio.aceitas_como_ganho, saida)
    _grupo("aceitos como aporte ou resgate", relatorio.aceitas_como_aporte, saida)
    _grupo("aceitos como gasto", relatorio.aceitas_como_gasto, saida)
    _grupo("pendentes na caixa", relatorio.pendentes, saida)
    _grupo("ignorados sem o motivo", relatorio.ignoradas_sem_motivo, saida)
    _grupo("ignorados com outro motivo (não tocados)", relatorio.ignoradas_com_outro_motivo, saida)
    _grupo("já corretos (movimento interno da conta)", relatorio.ja_corretas, saida)
    print("\nO que a correção faz:", file=saida)
    print(f"  ganhos, gastos e aportes removidos: {relatorio.lancamentos_removidos}", file=saida)
    print(f"  tratamentos de aporte confirmados: {relatorio.tratamentos_confirmados}", file=saida)
    if relatorio.recusadas:
        print("\nRECUSADO: há espelhos com dependência; nada foi gravado.", file=saida)
        for codigo, quantidade in sorted(relatorio.recusadas.items()):
            print(f"  {quantidade} x {_MOTIVOS.get(codigo, codigo)}", file=saida)
    elif relatorio.nada_a_fazer:
        print("\nNada a fazer.", file=saida)
