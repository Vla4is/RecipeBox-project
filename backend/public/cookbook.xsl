<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="5" encoding="UTF-8" indent="yes"/>


  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>
          <xsl:value-of select="cookbook/@title"/>
        </title>
        <link rel="stylesheet" href="/cookbook-assets/cookbook.css"/>
      </head>
      <body>
        <main class="page-shell">
          <section class="cover page-break">
            <p class="eyebrow">IT Systems Project</p>
            <h1>
              <xsl:value-of select="cookbook/@title"/>
            </h1>
            <p class="subtitle">
              <xsl:value-of select="cookbook/meta/subtitle"/>
            </p>
            <div class="cover-meta">
              <p>
                <strong>Recipes:</strong>
                <xsl:text> </xsl:text>
                <xsl:value-of select="cookbook/@recipeCount"/>
              </p>
              <p>
                <strong>Generated:</strong>
                <xsl:text> </xsl:text>
                <xsl:value-of select="substring(cookbook/@generatedAt, 1, 10)"/>
              </p>
            </div>
          </section>

          <section class="toc page-break">
            <h2>Contents</h2>
            <ol>
              <xsl:for-each select="cookbook/recipes/recipe">
                <li>
                  <a href="#recipe-{@id}">
                    <span class="toc-title">
                      <xsl:value-of select="title"/>
                    </span>
                    <span class="toc-meta">
                      <xsl:value-of select="difficulty"/>
                      <xsl:if test="totalTimeMin != ''">
                        <xsl:text> • </xsl:text>
                        <xsl:value-of select="totalTimeMin"/>
                        <xsl:text> min</xsl:text>
                      </xsl:if>
                    </span>
                  </a>
                </li>
              </xsl:for-each>
            </ol>
          </section>

          <xsl:for-each select="cookbook/recipes/recipe">
            <article class="recipe page-break" id="recipe-{@id}">
              <header class="recipe-header">
                <div>
                  <p class="recipe-kicker">Recipe</p>
                  <h2>
                    <xsl:value-of select="title"/>
                  </h2>
                </div>
                <div class="recipe-stats">
                  <span>
                    <strong>Difficulty</strong>
                    <xsl:value-of select="difficulty"/>
                  </span>
                  <span>
                    <strong>Servings</strong>
                    <xsl:choose>
                      <xsl:when test="servings != ''">
                        <xsl:value-of select="servings"/>
                      </xsl:when>
                      <xsl:otherwise>Flexible</xsl:otherwise>
                    </xsl:choose>
                  </span>
                  <span>
                    <strong>Total time</strong>
                    <xsl:choose>
                      <xsl:when test="totalTimeMin != ''">
                        <xsl:value-of select="totalTimeMin"/>
                        <xsl:text> min</xsl:text>
                      </xsl:when>
                      <xsl:otherwise>Not specified</xsl:otherwise>
                    </xsl:choose>
                  </span>
                  <span>
                    <strong>Rating</strong>
                    <xsl:value-of select="rating/@average"/>
                    <xsl:text>/5 (</xsl:text>
                    <xsl:value-of select="rating/@count"/>
                    <xsl:text>)</xsl:text>
                  </span>
                </div>
              </header>

              <xsl:if test="normalize-space(description) != ''">
                <p class="recipe-description">
                  <xsl:value-of select="description"/>
                </p>
              </xsl:if>

              <div class="recipe-grid">
                <section class="recipe-panel">
                  <h3>Ingredients</h3>
                  <ul class="ingredients">
                    <xsl:for-each select="ingredients/ingredient">
                      <li>
                        <span class="ingredient-qty">
                          <xsl:if test="@amount != ''">
                            <xsl:value-of select="@amount"/>
                            <xsl:text> </xsl:text>
                          </xsl:if>
                          <xsl:if test="@unit != ''">
                            <xsl:value-of select="@unit"/>
                          </xsl:if>
                        </span>
                        <span class="ingredient-name">
                          <xsl:value-of select="."/>
                        </span>
                        <xsl:if test="@notes != ''">
                          <span class="ingredient-notes">
                            <xsl:text> - </xsl:text>
                            <xsl:value-of select="@notes"/>
                          </span>
                        </xsl:if>
                      </li>
                    </xsl:for-each>
                  </ul>
                </section>

                <section class="recipe-panel">
                  <h3>Steps</h3>
                  <ol class="steps">
                    <xsl:for-each select="steps/step">
                      <li>
                        <span class="step-text">
                          <xsl:value-of select="."/>
                        </span>
                        <xsl:if test="@timerSec != ''">
                          <span class="step-timer">
                            <xsl:text>Timer: </xsl:text>
                            <xsl:value-of select="@timerSec"/>
                            <xsl:text> sec</xsl:text>
                          </span>
                        </xsl:if>
                      </li>
                    </xsl:for-each>
                  </ol>
                </section>
              </div>

              <xsl:if test="tags/tag">
                <footer class="recipe-footer">
                  <strong>Tags</strong>
                  <div class="tag-list">
                    <xsl:for-each select="tags/tag">
                      <span class="tag">
                        <xsl:value-of select="."/>
                      </span>
                    </xsl:for-each>
                  </div>
                </footer>
              </xsl:if>
            </article>
          </xsl:for-each>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
