import type { ComponentProps, ReactNode } from "react";
import estilos from "./Campo.module.css";
export function GrupoDeCampos({ legenda, children, className, ...resto }: ComponentProps<"fieldset"> & {legenda:ReactNode}) {
  return <fieldset {...resto} className={[estilos.grupo,className].filter(Boolean).join(" ")}><legend className={estilos.legenda}>{legenda}</legend>{children}</fieldset>;
}
