from datetime import date

from pydantic import BaseModel


class ImpactoContabilDaCategoriaResposta(BaseModel):
    categoria: str
    diferenca: str


class RevisaoMensalContabilResposta(BaseModel):
    mes: str
    periodo_completo: bool
    classificacoes_pendentes: int
    aportes_categorizados: int
    custos_como_aporte: int
    regra_anterior_liberdade_financeira: str
    aporte_liquido_confirmado: str
    diferenca_liberdade_financeira: str
    categorias: list[ImpactoContabilDaCategoriaResposta]
    afetado: bool


class RevisaoContabilResposta(BaseModel):
    inicio: date
    fim: date
    meses: list[RevisaoMensalContabilResposta]
