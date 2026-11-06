using ClosedXML.Excel;
using Prilixor.VendorDesk.Application.Inventory;

namespace Prilixor.VendorDesk.Api;

public static class CatalogWorkbook
{
    public const string VariantSeparator = " — ";

    public static byte[] Write(IReadOnlyList<CatalogProductDto> products)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Equipment Catalogue");
        sheet.Cell(1, 1).Value = "Category";
        sheet.Cell(1, 2).Value = "Equipment";
        sheet.Cell(1, 3).Value = "Variant / type";
        var header = sheet.Range(1, 1, 1, 3);
        header.Style.Font.Bold = true;
        header.Style.Font.FontColor = XLColor.White;
        header.Style.Fill.BackgroundColor = XLColor.FromHtml("#1B3A4B");
        var rowNumber = 2;
        foreach (var product in products)
        {
            var (equipment, variant) = Split(product.Name);
            sheet.Cell(rowNumber, 1).Value = product.CategoryName;
            sheet.Cell(rowNumber, 2).Value = equipment;
            sheet.Cell(rowNumber, 3).Value = variant;
            rowNumber++;
        }
        sheet.Column(1).Width = 28;
        sheet.Column(2).Width = 36;
        sheet.Column(3).Width = 36;
        sheet.SheetView.FreezeRows(1);
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public static (string Equipment, string Variant) Split(string name)
    {
        var index = name.IndexOf(VariantSeparator, StringComparison.Ordinal);
        if (index < 0) return (name, "");
        return (name[..index].Trim(), name[(index + VariantSeparator.Length)..].Trim());
    }

    public static CatalogSheet Read(Stream stream)
    {
        XLWorkbook workbook;
        try
        {
            workbook = new XLWorkbook(stream);
        }
        catch (Exception)
        {
            return CatalogSheet.Fail("Use an Excel .xlsx file.");
        }
        using (workbook)
        {
            var sheet = workbook.Worksheets.FirstOrDefault();
            var used = sheet?.RangeUsed();
            if (sheet is null || used is null) return new CatalogSheet([], null);
            var header = used.FirstRow();
            var categoryColumn = Column(header, "category");
            var nameColumn = Column(header, "product name") ?? Column(header, "product") ?? Column(header, "equipment") ?? Column(header, "name");
            var variantColumn = Column(header, "variant / type") ?? Column(header, "variant");
            if (categoryColumn is null || nameColumn is null)
                return CatalogSheet.Fail("The first row needs Category and a product column named Product name, Product, Equipment, or Name.");

            var rows = new List<CatalogImportRow>();
            foreach (var row in used.RowsUsed().Skip(1))
            {
                var category = row.Cell(categoryColumn.Value).GetString().Trim();
                var name = ProductName(row, nameColumn.Value, variantColumn);
                if (category.Length == 0 && name.Length == 0) continue;
                if (category.Length == 0 || name.Length == 0)
                    return CatalogSheet.Fail($"Row {row.RowNumber()} needs both a category and a product name.");
                if (category.Length > 80 || name.Length > 160)
                    return CatalogSheet.Fail($"Row {row.RowNumber()} category or product name is too long.");
                rows.Add(new CatalogImportRow(category, name));
            }
            if (rows.Count > 1000) return CatalogSheet.Fail("The sheet can contain up to 1000 products.");
            return new CatalogSheet(rows, null);
        }
    }

    private static string ProductName(IXLRangeRow row, int nameColumn, int? variantColumn)
    {
        var name = row.Cell(nameColumn).GetString().Trim();
        if (variantColumn is null) return name;
        var variant = row.Cell(variantColumn.Value).GetString().Trim();
        if (variant.Length == 0 || name.Contains(variant, StringComparison.OrdinalIgnoreCase)) return name;
        return name + CatalogWorkbook.VariantSeparator + variant;
    }

    private static int? Column(IXLRangeRow header, string title)
    {
        foreach (var cell in header.CellsUsed())
        {
            if (string.Equals(cell.GetString().Trim(), title, StringComparison.OrdinalIgnoreCase))
                return cell.Address.ColumnNumber;
        }
        return null;
    }
}

public sealed record CatalogSheet(IReadOnlyList<CatalogImportRow> Rows, string? Error)
{
    public static CatalogSheet Fail(string error) => new([], error);
}
