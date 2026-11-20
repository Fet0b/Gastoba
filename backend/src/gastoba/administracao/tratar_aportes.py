"""Tratamento lógico e reversível dos aportes sem investimento.

Padrão é ``--dry-run`` (só leitura). ``--aplicar`` registra as mesclas óbvias sem efeito nos totais;
``--aprovar`` (passo separado, depois de você ver o relatório) é o que tira o aporte dos totais.
Nada é apagado do banco. A saída tem só contagens e somas por mês.
"""

from typing import TextIO

from gastoba.application.planejar_tratamento_de_aportes import PlanoDeTratamento


def imprimir_plano(plano: PlanoDeTratamento, saida: TextIO, titulo: str) -> None:
    print(f"{titulo}\n", file=saida)
    print(f"Aportes sem investimento: {plano.sem_investimento}", file=saida)
    print(f"Mesclas óbvias (mesma conta, dia e valor): {len(plano.mesclas)}", file=saida)
    if plano.diferenca_por_mes:
        print("Diferença em aportes (e na Liberdade financeira) depois da aprovação:", file=saida)
        for m in plano.diferenca_por_mes:
            print(f"  {m.mes}: -{m.quantidade} aporte(s), -{m.valor}", file=saida)
    else:
        print("Nenhuma diferença nos totais.", file=saida)
