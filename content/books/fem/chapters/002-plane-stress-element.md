---
title: Plane Stress Element
slug: plane-stress-element
createdAt: '2026-03-02T02:58:47.271Z'
updatedAt: '2026-03-03T06:31:36.913Z'
publishedAt: '2026-03-02T02:59:32.325Z'
kind: chapter
bookSlug: fem
order: 2
summary: A fresh chapter.
status: published
allowExecution: false
fontPreset: archivo-narrow
---
# Introducción

## Representación de una Placa

![[RepresentacionMatematicaPlaca.png]]

### Modelo Matemático de la Placa

![[InternalStressPlate.png]]



## Relaciones Esfuerzo - Deformación

Para un cuerpo plano de espesor constante que se yace en un plano cartesiano $xy$, la relación esfuerzo - deformación (o relación constitutiva) de un material *isotropico lineal elástico* es:

:::align-center
$$
[\sigma]=[E][\epsilon]+[\sigma_0]
$$
:::

$$
[\epsilon]=[E]^{-1}[\sigma]+[\epsilon_0]
$$
$$
\begin{Bmatrix}
\epsilon_x \\
\epsilon_y \\
\gamma_{xy} 
\end{Bmatrix} =
\begin{bmatrix}
1/E & -\mu/E & 0 \\
-\mu/E & 1/E & 0 \\
0 & 0 & 1/G 
\end{bmatrix}
\begin{Bmatrix}
\sigma_x \\
\sigma_y \\
\tau_{xy} 
\end{Bmatrix} +
\begin{Bmatrix}
\epsilon_{x0} \\
\epsilon_{y0} \\
\gamma_{xy0} 
\end{Bmatrix}


\tag{1}
$$

$$
x^2 + y^2 = z^2
$$


$$
x^2 + y^2 = z^2
$$

Donde:
$E$ es el modulo elástico
$\mu$ es la constante de Poisson
$G$ es el modulo de corte
$\epsilon_0$ corresponde a las deformaciones unitarias iniciales, $\sigma_0=-E\epsilon_0$.

Para el caso de esfuerzos en el plano (**plane stress**) donde $\sigma_z=\tau_{yz}=\tau_{zx}=0$:
$$
E=\frac{E}{1-\mu^2}
\begin{bmatrix}
1 & \mu & 0 \\
\mu & 1 & 0 \\
0 & 0 & (1-\mu)/2
\end{bmatrix}

\tag{2}
$$
>[!NOTA:]
Para los problemas de **plane strain** el espesor es libre de aumentar o disminuir en respuesta a los esfuerzos del plano $xy$.

Para el caso de deformación unitaria en el plano (**plain strain**):
$$
E=\frac{E}{(1+\mu)(1-2\mu)}
\begin{bmatrix}
1-\mu & \mu & 0 \\
\mu & 1-\mu & 0 \\
0 & 0 & (1-2\mu)/2
\end{bmatrix}

\tag{3}
$$
Los esfuerzos en los problemas de esfuerzos en el plano (**plane strain**) son llamados esfuerzos de membrana. Estos son constantes a lo largo del espesor en la dirección $z$.

## Relaciones Deformación Unitaria - Desplazamiento

![[DifferentialElementStrains | 600]]
La relaciones *strain-displacement* son utilizadas para obtener un **campo de deformaciones** unitarias a partir de un **campo de desplazamientos**.

De forma general la deformación unitaria normal esta representada por el cambio de desplazamiento a lo largo de la longitud original y la deformación unitaria cortante esta definida como el cambio en el angulo. De forma que tenemos:
$$
\epsilon_x=\Delta u/ \Delta x
$$
$$
\epsilon_y=\Delta v/ \Delta y
$$
$$
\gamma_{xy}=\Delta u/ \Delta y+\Delta v/ \Delta x
$$
En general los desplazamientos $u$ y $v$ son funciones de las coordenadas:
$$
u=u(x,y)
$$
$$
v=v(x,y)
$$
Por lo tanto se debe utilizar derivadas parciales, por lo cual podemos escribir:
$$
\epsilon_x=\frac{\partial u}{\partial x}
\qquad
\epsilon_y=\frac{\partial v}{\partial y}
\qquad
\gamma_{xy}=\frac{\partial u}{\partial y} + \frac{\partial v}{\partial x}
$$
Lo cual puede ser representado en forma matricial como:
$$
[\epsilon]=[D] [u]
$$
$$
\begin{Bmatrix}
\epsilon_x \\
\epsilon_y \\
\gamma_{xy} 
\end{Bmatrix} =

\underbrace{
\begin{bmatrix}
\partial/\partial x & 0 \\
0 & \partial/\partial y \\
\partial/\partial y & \partial/\partial x
\end{bmatrix}
}_{[D]}

\begin{Bmatrix}
u \\
v  
\end{Bmatrix}

\tag{4}
$$
> [!NOTA:]
> Estas definiciones son adecuadas para pequeñas deformaciones unitarias y pequeñas rotaciones.

Los **desplazamientos** en un elemento finito plano son interpolados a partir de los desplazamientos nodales $u_i$ y $v_i$, de forma que:
$$
[u]=[N][d]
$$

^af1e3e

$$
\begin{Bmatrix}
u \\
v  
\end{Bmatrix} =

\begin{bmatrix}
N_1 & 0 & N_2 & 0 & \dots \\
0 & N_1 & 0 & N_2 & \dots \\
\end{bmatrix}

\begin{Bmatrix}
u_1 \\
v_1 \\
u_2 \\
v_2 \\
\vdots
\end{Bmatrix} 

\tag{5}
$$
Donde, $N_i$ corresponden a polinomiales independientes de forma (o interpolacion).
$[N]$ es llamado la matriz de función de forma.

> [!NOTA:]
> De acuerdo con la ecuación $u$ depende exclusivamente de los valores de $u_i$, y $v$ depende exclusivamente de los valores de $v_i$. Y tanto $u$ como $v$ usan las mismas funciones polinomiales de interpolación.

A partir de las ecuaciones $(4)$ y $(5)$ podemos obtener:
$$
[\epsilon] = 
\underbrace{
[\partial] [N] }_{[B]}
[d]
$$

Donde $[B]$ es llamada la matriz de deformaciones unitarias y desplazamientos (*strain-displacement matrix*).

$$
[B]=[D][N]
$$

## Matriz de Rigidez

La matriz de rigidez esta dada por:
$$
k=\int B^TEB \cdot dV

\tag{7}
$$
> [!NOTA:]
> Podemos ver a partir de la ecuación $(7)$ que dado un $E$ el valor de $k$ depende exclusivamente de $B$, el cual a su vez depende de la diferenciación de $N$. En otras palabras, la matriz de rigidez es una funciona de la funciones de forma.


## Cargas

Las cargas mecánicas son:
- Tracciones de superficie: Son cargas distribuidas aplicadas a un borde de la estructura.
- Fuerzas de cuerpo: Las fuerzas de cuerpo actúan sobre el volumen del elemento (La típica es el peso propio).
- Fuerzas y momentos concentrados.

![[surfaceTraction.png]]
## Condiciones de Borde

Las condiciones de borde incluyen tanto desplazamientos prescritos como fuerzas de superficie prescritas.

> [!NOTA:]
> El termino *support condition* es usado como un sinónimo para una condición de borde preestablecida.








---
#FEM #VirtualWork #PlaneStress
